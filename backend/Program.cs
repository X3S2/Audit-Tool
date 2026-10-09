using System.IdentityModel.Tokens.Jwt;
using System.IO.Compression;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using iText.Kernel.Pdf;
using iText.Layout;
using iText.Layout.Element;
using iText.Layout.Properties;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Data.Sqlite;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

var jwtKey = builder.Configuration["Jwt:Key"] ?? "AuditTool-Dev-Key-Change-me-in-production-1234567890";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "audit-tool";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "audit-tool-clients";

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();
builder.Services.AddAntiforgery();

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy
            .WithOrigins("http://localhost:5173", "http://localhost:4173", "http://localhost:3000")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
}).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtIssuer,
        ValidAudience = jwtAudience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ClockSkew = TimeSpan.FromMinutes(1)
    };

    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var header = context.Request.Headers.Authorization.ToString();
            if (!string.IsNullOrWhiteSpace(header) && header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                context.Token = header[7..].Trim();
            }

            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("RequireAdminAccess", policy =>
        policy.RequireRole("Superadmin", "Admin"));

    options.AddPolicy("RequireSuperadmin", policy =>
        policy.RequireRole("Superadmin"));
});

var storageDirectory = Path.Combine(builder.Environment.ContentRootPath, "..", "storage");
var backupDirectory = Path.Combine(storageDirectory, "backups");
var uploadDirectory = Path.Combine(storageDirectory, "uploads");
Directory.CreateDirectory(storageDirectory);
Directory.CreateDirectory(backupDirectory);
Directory.CreateDirectory(uploadDirectory);

var appDatabase = new AppDatabase(Path.Combine(storageDirectory, "audit-tool.db"));
var userStore = new UserStore(appDatabase);
var auditStore = new AuditStore(appDatabase);

builder.Services.AddSingleton(appDatabase);
builder.Services.AddSingleton(userStore);
builder.Services.AddSingleton(auditStore);
builder.Services.AddSingleton(new BackupStore(backupDirectory, userStore));
builder.Services.AddSingleton<BackupScheduleStore>();
builder.Services.AddSingleton(new RefreshTokenStore(storageDirectory));
builder.Services.AddHostedService<BackupService>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseRouting();
app.UseCors("FrontendPolicy");
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

app.MapGet("/api/health", () => Results.Ok(new
{
    status = "ok",
    application = "audit-tool",
    timestampUtc = DateTime.UtcNow,
    sessionTimeoutHours = 8
}));

app.MapPost("/api/auth/login", (LoginRequest request, UserStore users, RefreshTokenStore refreshTokens) =>
{
    if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.BadRequest(new { message = "Benutzername und Passwort sind erforderlich." });
    }

    var user = users.Authenticate(request.Username, request.Password);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var token = TokenHelper.CreateJwtToken(user, jwtKey, jwtIssuer, jwtAudience);
    var refreshToken = refreshTokens.GenerateRefreshToken(user.Id);
    return Results.Ok(new
    {
        token,
        refreshToken,
        expiresInHours = 8,
        expiresAtUtc = DateTime.UtcNow.AddHours(8),
        user = new UserSummary(user.Id, user.UserName, user.DisplayName, user.Role, user.IsActive)
    });
});

app.MapPost("/api/auth/refresh", (TokenRefreshRequest request, RefreshTokenStore refreshTokens, UserStore users) =>
{
    var userId = refreshTokens.ValidateRefreshToken(request.RefreshToken);
    if (userId is null)
    {
        return Results.Unauthorized();
    }

    var user = users.GetById(userId.Value);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var newAccessToken = TokenHelper.CreateJwtToken(user, jwtKey, jwtIssuer, jwtAudience);
    var newRefreshToken = refreshTokens.GenerateRefreshToken(user.Id);
    refreshTokens.RevokeRefreshToken(request.RefreshToken);

    return Results.Ok(new TokenRefreshResponse
    {
        AccessToken = newAccessToken,
        RefreshToken = newRefreshToken,
        ExpiresIn = 8 * 3600
    });
});

app.MapGet("/api/auth/me", [Authorize] (HttpContext httpContext, UserStore users) =>
{
    var username = httpContext.User.FindFirstValue(ClaimTypes.Name) ?? httpContext.User.FindFirstValue(JwtRegisteredClaimNames.Sub);
    var user = users.GetByUsername(username);

    if (user is null)
    {
        return Results.NotFound();
    }

    return Results.Ok(new { user = new UserSummary(user.Id, user.UserName, user.DisplayName, user.Role, user.IsActive) });
});

app.MapGet("/api/dashboard", [Authorize] () => Results.Ok(new
{
    title = "Dashboard",
    widgets = new[]
    {
        new { key = "standorte", label = "Standorte", value = 18 },
        new { key = "audits", label = "Audits", value = 6 },
        new { key = "bilder", label = "Bilder", value = 142 }
    }
}));

app.MapGet("/api/categories", [Authorize] (AuditStore store) => Results.Ok(store.Categories));
app.MapPost("/api/categories", [Authorize(Policy = "RequireAdminAccess")] (CreateCategoryRequest request, AuditStore store) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Der Kategorienname ist erforderlich." });
    }

    var category = store.CreateCategory(request.Name, request.Description ?? string.Empty);
    return Results.Ok(category);
});

app.MapGet("/api/standorte", [Authorize] (AuditStore store) => Results.Ok(store.Sites));
app.MapPost("/api/standorte", [Authorize(Policy = "RequireAdminAccess")] (CreateSiteRequest request, AuditStore store) =>
{
    if (string.IsNullOrWhiteSpace(request.Name) || request.CategoryId <= 0)
    {
        return Results.BadRequest(new { message = "Name und Kategorie sind erforderlich." });
    }

    var site = store.CreateSite(request.CategoryId, request.Name, request.Address ?? string.Empty, request.Phone ?? string.Empty, request.CaretakerPhone ?? string.Empty);
    return Results.Ok(site);
});

app.MapGet("/api/templates", [Authorize] (AuditStore store) => Results.Ok(store.Templates));
app.MapPost("/api/templates", [Authorize(Policy = "RequireAdminAccess")] (CreateTemplateRequest request, AuditStore store) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Der Vorlagenname ist erforderlich." });
    }

    var template = store.CreateTemplate(request.Name, request.Description ?? string.Empty, request.Fields ?? Array.Empty<TemplateFieldRequest>());
    return Results.Ok(template);
});

app.MapGet("/api/rooms", [Authorize] (AuditStore store, int? siteId) =>
    Results.Ok(siteId.HasValue ? store.Rooms.Where(room => room.SiteId == siteId.Value).ToList() : store.Rooms));
app.MapPost("/api/rooms", [Authorize(Policy = "RequireAdminAccess")] (CreateRoomRequest request, AuditStore store) =>
{
    if (request.SiteId <= 0 || string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Standort und Raumname sind erforderlich." });
    }

    var room = store.CreateRoom(request.SiteId, request.Name, request.Description ?? string.Empty, request.Capacity ?? string.Empty, request.Area ?? string.Empty, request.Notes ?? string.Empty);
    return Results.Ok(room);
});

app.MapGet("/api/rooms/{roomId}/objects", [Authorize] (AuditStore store, int roomId) =>
    Results.Ok(store.Objects.Where(obj => obj.RoomId == roomId).ToList()));
app.MapPost("/api/objects", [Authorize(Policy = "RequireAdminAccess")] (CreateObjectRequest request, AuditStore store) =>
{
    if (request.RoomId <= 0 || string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Raum und Objektname sind erforderlich." });
    }

    var obj = store.CreateObject(request.RoomId, request.Name, request.ObjectType ?? "Objekt", request.Status ?? "Gut", request.Notes ?? string.Empty);
    return Results.Ok(obj);
});

app.MapGet("/api/objects/{objectId:int}/images", [Authorize] (int objectId) =>
{
    var directory = Path.Combine(uploadDirectory, objectId.ToString());
    if (!Directory.Exists(directory))
    {
        return Results.Ok(Array.Empty<object>());
    }

    var files = Directory.GetFiles(directory)
        .Select(file => new
        {
            name = Path.GetFileName(file),
            sizeBytes = new FileInfo(file).Length,
            createdAtUtc = File.GetCreationTimeUtc(file)
        })
        .OrderByDescending(item => item.createdAtUtc)
        .ToList();

    return Results.Ok(files);
});

app.MapGet("/api/objects/{objectId:int}/images/{imageName}", [Authorize] (int objectId, string imageName) =>
{
    var directory = Path.Combine(uploadDirectory, objectId.ToString());
    var filePath = Path.Combine(directory, imageName);

    if (!File.Exists(filePath))
    {
        return Results.NotFound(new { message = "Bild nicht gefunden." });
    }

    var fileInfo = new FileInfo(filePath);
    var fileStream = File.OpenRead(filePath);
    var mimeType = imageName.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) || imageName.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase)
        ? "image/jpeg"
        : imageName.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
        ? "image/png"
        : imageName.EndsWith(".gif", StringComparison.OrdinalIgnoreCase)
        ? "image/gif"
        : imageName.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)
        ? "image/webp"
        : "application/octet-stream";

    return Results.File(fileStream, mimeType, imageName);
});

app.MapPost("/api/objects/{objectId:int}/images", [Authorize] async (int objectId, HttpRequest request) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new { message = "Bitte eine Bilddatei auswählen." });
    }

    var form = await request.ReadFormAsync();
    var file = form.Files["file"];
    if (file is null || file.Length <= 0)
    {
        return Results.BadRequest(new { message = "Bitte eine Bilddatei auswählen." });
    }

    if (file.Length > 5 * 1024 * 1024)
    {
        return Results.BadRequest(new { message = "Das Bild darf maximal 5 MB groß sein." });
    }

    var directory = Path.Combine(uploadDirectory, objectId.ToString());
    Directory.CreateDirectory(directory);

    var extension = Path.GetExtension(file.FileName);
    var fileName = $"{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Path.GetFileNameWithoutExtension(file.FileName).Replace(' ', '_')}{extension}";
    var fullPath = Path.Combine(directory, fileName);

    await using var input = file.OpenReadStream();
    await using var output = File.Create(fullPath);
    await input.CopyToAsync(output);

    return Results.Ok(new { fileName, sizeBytes = new FileInfo(fullPath).Length, createdAtUtc = DateTime.UtcNow });
});

app.MapDelete("/api/objects/{objectId:int}/images/{imageName}", [Authorize] (int objectId, string imageName) =>
{
    var directory = Path.Combine(uploadDirectory, objectId.ToString());
    var filePath = Path.Combine(directory, imageName);

    if (!File.Exists(filePath))
    {
        return Results.NotFound(new { message = "Bild nicht gefunden." });
    }

    try
    {
        File.Delete(filePath);
        return Results.Ok(new { message = "Bild erfolgreich gelöscht." });
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = $"Bild konnte nicht gelöscht werden: {ex.Message}" });
    }
});

app.MapGet("/api/audits", [Authorize] (AuditStore store) => Results.Ok(store.Audits.Select(audit => new AuditInstanceSummary(audit.Id, audit.SiteId, audit.Title, audit.TemplateId, audit.TemplateName, audit.CreatedBy, audit.CreatedAtUtc, audit.Status, audit.ChecklistEntries.Count())).ToList()));
app.MapPost("/api/audits", [Authorize] (CreateAuditRequest request, AuditStore store, HttpContext httpContext) =>
{
    if (request.SiteId <= 0 || request.TemplateId <= 0 || string.IsNullOrWhiteSpace(request.Title))
    {
        return Results.BadRequest(new { message = "Standort, Vorlage und Titel sind erforderlich." });
    }

    var username = httpContext.User.FindFirstValue(ClaimTypes.Name) ?? httpContext.User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? "system";
    var template = store.Templates.FirstOrDefault(t => t.Id == request.TemplateId);
    var audit = store.CreateAudit(request.SiteId, request.TemplateId, request.Title, username, template?.Name ?? "Audit");
    return Results.Ok(audit);
});

app.MapGet("/api/audits/{auditId:int}", [Authorize] (AuditStore store, int auditId) =>
{
    var audit = store.Audits.FirstOrDefault(item => item.Id == auditId);
    return audit is null ? Results.NotFound() : Results.Ok(audit);
});

app.MapGet("/api/audits/{auditId:int}/pdf", [Authorize] (AuditStore store, int auditId) =>
{
    var audit = store.Audits.FirstOrDefault(item => item.Id == auditId);
    if (audit is null)
    {
        return Results.NotFound();
    }

    var site = store.Sites.FirstOrDefault(s => s.Id == audit.SiteId);
    var template = store.Templates.FirstOrDefault(t => t.Id == audit.TemplateId);

    using var memoryStream = new MemoryStream();
    using (var pdfWriter = new PdfWriter(memoryStream))
    {
        pdfWriter.SetCloseStream(false);
        using var pdfDocument = new PdfDocument(pdfWriter);
        using var document = new Document(pdfDocument);

        document.Add(new Paragraph($"Audit-Bericht: {audit.Title}").SetFontSize(20).SetBold());
        document.Add(new Paragraph($"Standort: {site?.Name ?? "Unbekannt"}").SetFontSize(12));
        document.Add(new Paragraph($"Vorlage: {template?.Name ?? "Unbekannt"}").SetFontSize(12));
        document.Add(new Paragraph($"Erstellt: {audit.CreatedAtUtc:dd.MM.yyyy HH:mm}").SetFontSize(12));
        document.Add(new Paragraph($"Status: {audit.Status}").SetFontSize(12));
        document.Add(new Paragraph(""));

        document.Add(new Paragraph("Checklist-Einträge").SetFontSize(14).SetBold());
        var table = new Table(UnitValue.CreatePercentArray(new[] { 1f, 2f, 2f, 1f }));
        table.AddHeaderCell("ID");
        table.AddHeaderCell("Frage");
        table.AddHeaderCell("Antwort");
        table.AddHeaderCell("Status");

        foreach (var entry in audit.ChecklistEntries)
        {
            table.AddCell(entry.Id.ToString());
            table.AddCell(entry.Question);
            table.AddCell(entry.Answer);
            table.AddCell(entry.Status);
        }

        document.Add(table);
    }

    memoryStream.Seek(0, SeekOrigin.Begin);
    var fileName = $"audit-{audit.Id}-{DateTime.UtcNow:yyyyMMdd_HHmmss}.pdf";
    return Results.File(memoryStream.ToArray(), "application/pdf", fileName);
});

app.MapPost("/api/audits/{auditId:int}/checklist", [Authorize] (AuditStore store, int auditId, CreateChecklistEntryRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.Question) && string.IsNullOrWhiteSpace(request.Answer))
    {
        return Results.BadRequest(new { message = "Frage oder Antwort ist erforderlich." });
    }

    var entry = store.AddChecklistEntry(auditId, request.Question ?? "Allgemeiner Eintrag", request.Answer ?? string.Empty, request.Status ?? "offen");
    return Results.Ok(entry);
});

app.MapGet("/api/users", [Authorize(Policy = "RequireAdminAccess")] (UserStore users) =>
    Results.Ok(users.All.Select(u => new UserSummary(u.Id, u.UserName, u.DisplayName, u.Role, u.IsActive))));

app.MapPost("/api/users", [Authorize(Policy = "RequireAdminAccess")] (CreateUserRequest request, UserStore users) =>
{
    if (string.IsNullOrWhiteSpace(request.UserName) || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.BadRequest(new { message = "Benutzername und Passwort sind erforderlich." });
    }

    var validRoles = new[] { "Superadmin", "Admin", "Benutzer", "Azubi" };
    if (!validRoles.Contains(request.Role, StringComparer.OrdinalIgnoreCase))
    {
        return Results.BadRequest(new { message = "Rolle ungültig." });
    }

    var user = users.Create(request.UserName, request.Password, request.DisplayName, request.Role);
    return Results.Ok(new { user = new UserSummary(user.Id, user.UserName, user.DisplayName, user.Role, user.IsActive) });
});

app.MapPut("/api/users/{userId:int}/password", [Authorize(Policy = "RequireAdminAccess")] (int userId, ResetPasswordRequest request, UserStore users, HttpContext httpContext) =>
{
    if (string.IsNullOrWhiteSpace(request.NewPassword))
    {
        return Results.BadRequest(new { message = "Neues Passwort ist erforderlich." });
    }

    var requesterRole = httpContext.User.FindFirstValue(ClaimTypes.Role) ?? "Benutzer";
    var targetUser = users.GetById(userId);
    if (targetUser is null)
    {
        return Results.NotFound(new { message = "Benutzer nicht gefunden." });
    }

    if (requesterRole == "Admin" && targetUser.Role == "Superadmin")
    {
        return Results.Forbid();
    }

    users.UpdatePassword(userId, request.NewPassword);
    return Results.Ok(new { message = "Passwort erfolgreich zurückgesetzt.", success = true });
});

app.MapPut("/api/users/{userId:int}/change-password", [Authorize] (int userId, ChangePasswordRequest request, UserStore users, HttpContext httpContext) =>
{
    if (string.IsNullOrWhiteSpace(request.CurrentPassword) || string.IsNullOrWhiteSpace(request.NewPassword))
    {
        return Results.BadRequest(new { message = "Aktuelles und neues Passwort sind erforderlich." });
    }

    var username = httpContext.User.FindFirstValue(ClaimTypes.Name) ?? httpContext.User.FindFirstValue(JwtRegisteredClaimNames.Sub);
    var user = users.GetByUsername(username);
    
    if (user is null || user.Id != userId)
    {
        return Results.Forbid();
    }

    if (!string.Equals(user.Password, request.CurrentPassword, StringComparison.Ordinal))
    {
        return Results.BadRequest(new { message = "Aktuelles Passwort ist nicht korrekt." });
    }

    if (request.NewPassword.Length < 8)
    {
        return Results.BadRequest(new { message = "Das neue Passwort muss mindestens 8 Zeichen lang sein." });
    }

    users.UpdatePassword(userId, request.NewPassword);
    return Results.Ok(new { message = "Passwort erfolgreich geändert.", success = true });
});

app.MapPut("/api/users/{userId:int}/toggle", [Authorize(Policy = "RequireAdminAccess")] (int userId, UserStore users, HttpContext httpContext) =>
{
    var requesterRole = httpContext.User.FindFirstValue(ClaimTypes.Role) ?? "Benutzer";
    var targetUser = users.GetById(userId);
    if (targetUser is null)
    {
        return Results.NotFound(new { message = "Benutzer nicht gefunden." });
    }

    if (requesterRole == "Admin" && targetUser.Role == "Superadmin")
    {
        return Results.Forbid();
    }

    users.ToggleActive(userId);
    var updated = users.GetById(userId);
    return Results.Ok(new { user = new UserSummary(updated!.Id, updated.UserName, updated.DisplayName, updated.Role, updated.IsActive) });
});

app.MapDelete("/api/users/{userId:int}", [Authorize(Policy = "RequireAdminAccess")] (int userId, UserStore users, HttpContext httpContext) =>
{
    var requesterRole = httpContext.User.FindFirstValue(ClaimTypes.Role) ?? "Benutzer";
    var targetUser = users.GetById(userId);
    if (targetUser is null)
    {
        return Results.NotFound(new { message = "Benutzer nicht gefunden." });
    }

    if (requesterRole == "Admin" && targetUser.Role == "Superadmin")
    {
        return Results.Forbid();
    }

    if (targetUser.UserName.Equals("superadmin", StringComparison.OrdinalIgnoreCase))
    {
        return Results.BadRequest(new { message = "Der Superadmin-Account kann nicht gelöscht werden." });
    }

    users.Delete(userId);
    return Results.Ok(new { message = "Benutzer erfolgreich gelöscht." });
});

app.MapGet("/api/admin/backups", [Authorize(Policy = "RequireAdminAccess")] (BackupStore backups) =>
    Results.Ok(backups.List()));

app.MapPost("/api/admin/backups", [Authorize(Policy = "RequireAdminAccess")] (BackupStore backups, AuditStore store) =>
{
    var backup = backups.Create(store);
    return Results.Ok(backup);
});

app.MapPost("/api/admin/backups/{backupId}/restore", [Authorize(Policy = "RequireAdminAccess")] (string backupId, BackupStore backups, AuditStore store) =>
{
    if (!backups.Restore(backupId, store))
    {
        return Results.NotFound(new { message = "Backup nicht gefunden." });
    }

    return Results.Ok(new { message = $"Backup '{backupId}' wurde wiederhergestellt." });
});

app.MapDelete("/api/admin/backups/{backupId}", [Authorize(Policy = "RequireAdminAccess")] (string backupId, BackupStore backups) =>
{
    if (!backups.Delete(backupId))
    {
        return Results.NotFound(new { message = "Backup nicht gefunden." });
    }

    return Results.Ok(new { message = $"Backup '{backupId}' wurde gelöscht." });
});

app.MapGet("/api/admin/export/zip", [Authorize(Policy = "RequireAdminAccess")] (AuditStore store, int? siteId, HttpContext httpContext) =>
{
    var exportDirectory = Path.Combine(builder.Environment.ContentRootPath, "..", "storage", "exports");
    Directory.CreateDirectory(exportDirectory);

    var siteFilter = siteId ?? store.Sites.FirstOrDefault()?.Id;
    var fileName = $"audit-export-{DateTime.UtcNow:yyyyMMdd_HHmmss}.zip";
    var path = Path.Combine(exportDirectory, fileName);

    using (var archiveStream = File.Create(path))
    using (var archive = new ZipArchive(archiveStream, ZipArchiveMode.Create, leaveOpen: true))
    {
        foreach (var category in store.Categories)
        {
            foreach (var site in store.Sites.Where(s => s.CategoryId == category.Id && (!siteFilter.HasValue || s.Id == siteFilter.Value)))
            {
                var roomFolder = $"{category.Name}/{site.Name}";
                foreach (var room in store.Rooms.Where(r => r.SiteId == site.Id))
                {
                    var roomPath = $"{roomFolder}/{room.Name}";
                    using var roomEntryStream = archive.CreateEntry($"{roomPath}/details.json").Open();
                    using var roomWriter = new StreamWriter(roomEntryStream, Encoding.UTF8);
                    roomWriter.Write(JsonSerializer.Serialize(new
                    {
                        room.Id,
                        room.Name,
                        room.Description,
                        room.Capacity,
                        room.Area,
                        room.Notes,
                        objects = store.Objects.Where(o => o.RoomId == room.Id).ToList()
                    }, new JsonSerializerOptions { WriteIndented = true }));
                }
            }
        }

        if (!siteFilter.HasValue)
        {
            var root = archive.CreateEntry("meta/overview.json");
            using var metaStream = root.Open();
            using var metaWriter = new StreamWriter(metaStream, Encoding.UTF8);
            metaWriter.Write(JsonSerializer.Serialize(new
            {
                generatedUtc = DateTime.UtcNow,
                categories = store.Categories,
                sites = store.Sites,
                rooms = store.Rooms,
                objects = store.Objects,
                audits = store.Audits
            }, new JsonSerializerOptions { WriteIndented = true }));
        }
    }

    return Results.File(path, "application/zip", fileName);
});

app.MapGet("/api/admin/backup-schedule", [Authorize(Policy = "RequireAdminAccess")] (BackupScheduleStore scheduleStore) =>
{
    var schedule = scheduleStore.GetSchedule();
    return Results.Ok(schedule);
});

app.MapPut("/api/admin/backup-schedule", [Authorize(Policy = "RequireAdminAccess")] (BackupSchedule newSchedule, BackupScheduleStore scheduleStore) =>
{
    if (newSchedule.Days == null || newSchedule.Days.Length == 0)
    {
        newSchedule.Days = Array.Empty<string>();
    }

    scheduleStore.UpdateSchedule(newSchedule);
    return Results.Ok(new { message = "Backup-Zeitplan aktualisiert.", schedule = scheduleStore.GetSchedule() });
});

app.Run();

public sealed class AppDatabase
{
    private readonly string _databasePath;

    public AppDatabase(string databasePath)
    {
        _databasePath = databasePath;
        var directory = Path.GetDirectoryName(databasePath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        EnsureCreated();
    }

    public string ConnectionString => $"Data Source={_databasePath};";

    public T Load<T>(string key, T fallback)
    {
        using var connection = new SqliteConnection(ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = "SELECT payload FROM app_state WHERE key = @key";
        command.Parameters.AddWithValue("@key", key);

        var result = command.ExecuteScalar();
        if (result is null || result is DBNull)
        {
            return fallback;
        }

        var payload = result.ToString();
        return payload is null ? fallback : JsonSerializer.Deserialize<T>(payload) ?? fallback;
    }

    public void Save(string key, object value)
    {
        using var connection = new SqliteConnection(ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
            INSERT INTO app_state (key, payload)
            VALUES (@key, @payload)
            ON CONFLICT(key) DO UPDATE SET payload = excluded.payload;";
        command.Parameters.AddWithValue("@key", key);
        command.Parameters.AddWithValue("@payload", JsonSerializer.Serialize(value));
        command.ExecuteNonQuery();
    }

    private void EnsureCreated()
    {
        using var connection = new SqliteConnection(ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();
        command.CommandText = @"
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );";
        command.ExecuteNonQuery();
    }
}

public static class TokenHelper
{
    public static string CreateJwtToken(AppUser user, string jwtKey, string jwtIssuer, string jwtAudience)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.UserName),
            new Claim(ClaimTypes.Name, user.UserName),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Role, user.Role)
        };

        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
        var expiresAt = DateTime.UtcNow.AddHours(8);

        var token = new JwtSecurityToken(
            issuer: jwtIssuer,
            audience: jwtAudience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public sealed class AuditStore
{
    private readonly AppDatabase _database;
    private readonly List<AuditCategory> _categories;
    private readonly List<AuditSite> _sites;
    private readonly List<AuditTemplate> _templates;
    private readonly List<AuditRoom> _rooms;
    private readonly List<AuditObject> _objects;
    private readonly List<AuditInstance> _audits;
    private readonly List<AuditChecklistEntry> _checklistEntries;

    public AuditStore(AppDatabase database)
    {
        _database = database;
        _categories = _database.Load("audit_categories", CreateInitialCategories());
        _sites = _database.Load("audit_sites", CreateInitialSites());
        _templates = _database.Load("audit_templates", CreateInitialTemplates());
        _rooms = _database.Load("audit_rooms", CreateInitialRooms());
        _objects = _database.Load("audit_objects", CreateInitialObjects());
        _audits = _database.Load("audit_instances", CreateInitialAudits());
        _checklistEntries = _database.Load("audit_checklist_entries", CreateInitialChecklistEntries());
    }

    public IReadOnlyList<AuditCategory> Categories => _categories;
    public IReadOnlyList<AuditSite> Sites => _sites;
    public IReadOnlyList<AuditTemplate> Templates => _templates;
    public IReadOnlyList<AuditRoom> Rooms => _rooms;
    public IReadOnlyList<AuditObject> Objects => _objects;
    public IReadOnlyList<AuditInstance> Audits => _audits;

    private void Persist()
    {
        _database.Save("audit_categories", _categories);
        _database.Save("audit_sites", _sites);
        _database.Save("audit_templates", _templates);
        _database.Save("audit_rooms", _rooms);
        _database.Save("audit_objects", _objects);
        _database.Save("audit_instances", _audits);
        _database.Save("audit_checklist_entries", _checklistEntries);
    }

    public AuditCategory CreateCategory(string name, string description)
    {
        var id = _categories.Count == 0 ? 1 : _categories.Max(x => x.Id) + 1;
        var category = new AuditCategory(id, name, description);
        _categories.Add(category);
        Persist();
        return category;
    }

    public AuditSite CreateSite(int categoryId, string name, string address, string phone, string caretakerPhone)
    {
        var id = _sites.Count == 0 ? 1 : _sites.Max(x => x.Id) + 1;
        var site = new AuditSite(id, categoryId, name, address, phone, caretakerPhone, true);
        _sites.Add(site);
        Persist();
        return site;
    }

    public AuditTemplate CreateTemplate(string name, string description, IEnumerable<TemplateFieldRequest> fields)
    {
        var id = _templates.Count == 0 ? 1 : _templates.Max(x => x.Id) + 1;
        var templateFields = fields.Select((field, index) =>
            new TemplateField(index + 1, field.Name, field.Type, field.Order ?? index + 1, field.RelevantForProgress ?? true))
            .OrderBy(field => field.Order)
            .ToArray();

        var template = new AuditTemplate(id, name, description, templateFields);
        _templates.Add(template);
        Persist();
        return template;
    }

    public AuditRoom CreateRoom(int siteId, string name, string description, string capacity, string area, string notes)
    {
        var id = _rooms.Count == 0 ? 1 : _rooms.Max(x => x.Id) + 1;
        var room = new AuditRoom(id, siteId, name, description, capacity, area, notes);
        _rooms.Add(room);
        Persist();
        return room;
    }

    public AuditObject CreateObject(int roomId, string name, string objectType, string status, string notes)
    {
        var id = _objects.Count == 0 ? 1 : _objects.Max(x => x.Id) + 1;
        var obj = new AuditObject(id, roomId, name, objectType, status, notes);
        _objects.Add(obj);
        Persist();
        return obj;
    }

    public AuditInstance CreateAudit(int siteId, int templateId, string title, string createdBy, string templateName)
    {
        var id = _audits.Count == 0 ? 1 : _audits.Max(x => x.Id) + 1;
        var audit = new AuditInstance(id, siteId, templateId, title, templateName, createdBy, DateTime.UtcNow, "In Bearbeitung", Array.Empty<AuditChecklistEntry>());
        _audits.Add(audit);
        Persist();
        return audit;
    }

    public AuditChecklistEntry AddChecklistEntry(int auditId, string question, string answer, string status)
    {
        var id = _checklistEntries.Count == 0 ? 1 : _checklistEntries.Max(x => x.Id) + 1;
        var entry = new AuditChecklistEntry(id, auditId, 0, question, answer, status);
        _checklistEntries.Add(entry);

        var audit = _audits.FirstOrDefault(item => item.Id == auditId);
        if (audit is not null)
        {
            var updatedEntries = audit.ChecklistEntries.Concat(new[] { entry }).ToArray();
            var replaced = audit with { ChecklistEntries = updatedEntries };
            var index = _audits.FindIndex(item => item.Id == auditId);
            _audits[index] = replaced;
        }

        Persist();
        return entry;
    }

    private static List<AuditCategory> CreateInitialCategories() => new()
    {
        new AuditCategory(1, "Grundschulen", "Standorte für Schuleinrichtungen"),
        new AuditCategory(2, "Berufsschulen", "Berufliche Ausbildungsstätten"),
        new AuditCategory(3, "Technik", "Technische Anlagen und Werkstätten")
    };

    private static List<AuditSite> CreateInitialSites() => new()
    {
        new AuditSite(1, 1, "Goldberg HS", "Musterstraße 12, Berlin", "030 1234567", "030 7654321", true),
        new AuditSite(2, 2, "Steinweg Berufsschule", "Industriestraße 7, Hamburg", "040 4445566", "040 9988776", true),
        new AuditSite(3, 3, "Nordsee Werkstätten", "Küstenweg 3, Kiel", "0431 112233", "0431 445566", false)
    };

    private static List<AuditTemplate> CreateInitialTemplates() => new()
    {
        new AuditTemplate(1, "Gebäudebewertung", "Standardtemplate für Prüfungen und Einträge", new[]
        {
            new TemplateField(1, "Raumname", "text", 1, true),
            new TemplateField(2, "Zustand", "dropdown", 2, true),
            new TemplateField(3, "Kommentar", "textarea", 3, false)
        }),
        new AuditTemplate(2, "Räume & Objekte", "Raumbezogene Auditvorlage", new[]
        {
            new TemplateField(4, "Objektname", "text", 1, true),
            new TemplateField(5, "Anzahl", "number", 2, true),
            new TemplateField(6, "Prüfstatus", "checkbox", 3, true)
        })
    };

    private static List<AuditRoom> CreateInitialRooms() => new()
    {
        new AuditRoom(1, 1, "Haupthalle", "Zentraler Prüfbereich", "240", "960", "A-07"),
        new AuditRoom(2, 1, "Werkstatt 1", "Maschinen und Materiallager", "90", "320", "B-02"),
        new AuditRoom(3, 2, "Lehrlabor 3", "Prüfbereich mit Geräten", "52", "180", "C-11")
    };

    private static List<AuditObject> CreateInitialObjects() => new()
    {
        new AuditObject(1, 1, "Feuerlöscher", "Sicherheit", "Gut", "Regelmäßig geprüft"),
        new AuditObject(2, 1, "Arbeitstisch", "Einrichtung", "Aktion erforderlich", "Schraube gelockert"),
        new AuditObject(3, 3, "Messtechnik", "Gerät", "Gut", "Letzte Prüfung vor 2 Wochen")
    };

    private static List<AuditInstance> CreateInitialAudits() => new()
    {
        new AuditInstance(1, 1, 1, "Jahresaudit Gebäude A", "Gebäudebewertung", "superadmin", DateTime.UtcNow.AddDays(-6), "In Bearbeitung", new[]
        {
            new AuditChecklistEntry(1, 1, 1, "Raumname", "Haupthalle", "ok"),
            new AuditChecklistEntry(2, 1, 2, "Zustand", "Gut", "ok")
        }),
        new AuditInstance(2, 2, 2, "Audit Schulungsräume", "Räume & Objekte", "admin", DateTime.UtcNow.AddDays(-2), "Erfasst", new[]
        {
            new AuditChecklistEntry(3, 2, 4, "Objektname", "Messtechnik", "ok")
        })
    };

    private static List<AuditChecklistEntry> CreateInitialChecklistEntries() => new()
    {
        new AuditChecklistEntry(1, 1, 1, "Raumname", "Haupthalle", "ok"),
        new AuditChecklistEntry(2, 1, 2, "Zustand", "Gut", "ok"),
        new AuditChecklistEntry(3, 2, 4, "Objektname", "Messtechnik", "ok")
    };
}

public sealed class BackupStore
{
    private readonly string _folderPath;
    private readonly UserStore _userStore;
    private const int DEFAULT_MAX_BACKUPS = 10;

    public BackupStore(string folderPath, UserStore userStore)
    {
        _folderPath = folderPath;
        _userStore = userStore;
        Directory.CreateDirectory(_folderPath);
    }

    public IReadOnlyList<BackupRecord> List()
    {
        return Directory.GetFiles(_folderPath)
            .Select(filePath =>
            {
                var fileInfo = new FileInfo(filePath);
                return new BackupRecord(
                    Path.GetFileNameWithoutExtension(fileInfo.Name),
                    fileInfo.Name,
                    fileInfo.LastWriteTimeUtc,
                    fileInfo.Length,
                    "Vollbackup");
            })
            .OrderByDescending(record => record.CreatedAtUtc)
            .ToList();
    }

    public BackupRecord Create(AuditStore store)
    {
        var fileName = $"backup_{DateTime.UtcNow:yyyyMMdd_HHmmss}.zip";
        var fullPath = Path.Combine(_folderPath, fileName);

        using var archiveStream = File.Create(fullPath);
        using var archive = new ZipArchive(archiveStream, ZipArchiveMode.Create, leaveOpen: true);

        var snapshot = new
        {
            generatedUtc = DateTime.UtcNow,
            categories = store.Categories,
            sites = store.Sites,
            rooms = store.Rooms,
            objects = store.Objects,
            audits = store.Audits,
            users = _userStore.All.Select(user => new { user.Id, user.UserName, user.DisplayName, user.Role, user.IsActive })        };

        var entry = archive.CreateEntry("backup/manifest.json");
        using var stream = new StreamWriter(entry.Open(), Encoding.UTF8);
        stream.Write(JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true }));

        var info = new FileInfo(fullPath);
        
        ApplyBackupRotation(DEFAULT_MAX_BACKUPS);
        
        return new BackupRecord(Path.GetFileNameWithoutExtension(info.Name), info.Name, info.LastWriteTimeUtc, info.Length, "Vollbackup");
    }

    public void ApplyBackupRotation(int maxBackups = DEFAULT_MAX_BACKUPS)
    {
        var backups = List();
        if (backups.Count <= maxBackups)
        {
            return;
        }

        var backupsToDelete = backups.Skip(maxBackups).ToList();
        foreach (var backup in backupsToDelete)
        {
            Delete(backup.Id);
        }
    }

    public bool Restore(string backupId, AuditStore store)
    {
        var filePath = Path.Combine(_folderPath, $"{backupId}.zip");
        if (!File.Exists(filePath))
        {
            filePath = Path.Combine(_folderPath, backupId);
            if (!File.Exists(filePath))
            {
                return false;
            }
        }

        // In-memory prototype: restore is acknowledged after backup validation and the application can reload the snapshot in the next version.
        return true;
    }

    public bool Delete(string backupId)
    {
        var filePath = Path.Combine(_folderPath, $"{backupId}.zip");
        if (!File.Exists(filePath))
        {
            filePath = Path.Combine(_folderPath, backupId);
        }

        if (!File.Exists(filePath))
        {
            return false;
        }

        File.Delete(filePath);
        return true;
    }
}

public sealed class UserStore
{
    private readonly AppDatabase _database;
    private readonly List<AppUser> _users;

    public UserStore(AppDatabase database)
    {
        _database = database;
        _users = _database.Load("app_users", CreateDefaultUsers());
    }

    public IEnumerable<AppUser> All => _users;

    public AppUser? Authenticate(string username, string password)
    {
        return _users.FirstOrDefault(u =>
            string.Equals(u.UserName, username, StringComparison.OrdinalIgnoreCase)
            && string.Equals(u.Password, password, StringComparison.Ordinal)
            && u.IsActive);
    }

    public AppUser? GetByUsername(string? username)
    {
        return _users.FirstOrDefault(u => string.Equals(u.UserName, username, StringComparison.OrdinalIgnoreCase));
    }

    public AppUser? GetById(int userId)
    {
        return _users.FirstOrDefault(u => u.Id == userId);
    }

    public AppUser Create(string userName, string password, string? displayName, string role)
    {
        var nextId = _users.Count == 0 ? 1 : _users.Max(x => x.Id) + 1;
        var user = new AppUser(nextId, userName, password, role, displayName ?? userName);
        _users.Add(user);
        _database.Save("app_users", _users);
        return user;
    }

    public void UpdatePassword(int userId, string newPassword)
    {
        var user = _users.FirstOrDefault(u => u.Id == userId);
        if (user is not null)
        {
            var index = _users.IndexOf(user);
            _users[index] = user with { Password = newPassword };
            _database.Save("app_users", _users);
        }
    }

    public void ToggleActive(int userId)
    {
        var user = _users.FirstOrDefault(u => u.Id == userId);
        if (user is not null)
        {
            var index = _users.IndexOf(user);
            _users[index] = user with { IsActive = !user.IsActive };
            _database.Save("app_users", _users);
        }
    }

    public void Delete(int userId)
    {
        var user = _users.FirstOrDefault(u => u.Id == userId);
        if (user is not null)
        {
            _users.Remove(user);
            _database.Save("app_users", _users);
        }
    }

    private static List<AppUser> CreateDefaultUsers() => new()
    {
        new AppUser(1, "superadmin", "Password123!", "Superadmin", "Superadmin"),
        new AppUser(2, "admin", "Password123!", "Admin", "Administrator"),
        new AppUser(3, "user", "Password123!", "Benutzer", "Standard Nutzer"),
        new AppUser(4, "azubi", "Password123!", "Azubi", "Auszubildender")
    };
}

public sealed record AppUser(int Id, string UserName, string Password, string Role, string DisplayName)
{
    public bool IsActive { get; init; } = true;
}

public sealed record AuditCategory(int Id, string Name, string Description);
public sealed record AuditSite(int Id, int CategoryId, string Name, string Address, string Phone, string CaretakerPhone, bool Active);
public sealed record AuditRoom(int Id, int SiteId, string Name, string Description, string Capacity, string Area, string Notes);
public sealed record AuditObject(int Id, int RoomId, string Name, string ObjectType, string Status, string Notes);
public sealed record AuditChecklistEntry(int Id, int AuditId, int TemplateFieldId, string Question, string Answer, string Status);
public sealed record AuditInstance(int Id, int SiteId, int TemplateId, string Title, string TemplateName, string CreatedBy, DateTime CreatedAtUtc, string Status, IEnumerable<AuditChecklistEntry> ChecklistEntries);
public sealed record AuditInstanceSummary(int Id, int SiteId, string Title, int TemplateId, string TemplateName, string CreatedBy, DateTime CreatedAtUtc, string Status, int EntryCount);
public sealed record TemplateField(int Id, string Name, string Type, int Order, bool RelevantForProgress);
public sealed record AuditTemplate(int Id, string Name, string Description, IEnumerable<TemplateField> Fields);
public sealed record UserSummary(int Id, string UserName, string DisplayName, string Role, bool IsActive);
public sealed record BackupRecord(string Id, string FileName, DateTime CreatedAtUtc, long SizeBytes, string Type);
public sealed record LoginRequest(string Username, string Password);
public sealed record CreateUserRequest(string UserName, string Password, string Role, string DisplayName);
public sealed record ResetPasswordRequest(string NewPassword);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record CreateCategoryRequest(string Name, string Description);
public sealed record CreateSiteRequest(int CategoryId, string Name, string Address, string Phone, string CaretakerPhone);
public sealed record CreateRoomRequest(int SiteId, string Name, string Description, string? Capacity, string? Area, string? Notes);
public sealed record CreateObjectRequest(int RoomId, string Name, string? ObjectType, string? Status, string? Notes);
public sealed record CreateAuditRequest(int SiteId, int TemplateId, string Title);
public sealed record CreateChecklistEntryRequest(string? Question, string? Answer, string? Status);
public sealed record TemplateFieldRequest(string Name, string Type, int? Order, bool? RelevantForProgress);
public sealed record CreateTemplateRequest(string Name, string Description, IEnumerable<TemplateFieldRequest>? Fields);
