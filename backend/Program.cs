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
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy
            .WithOrigins("http://localhost:5173", "http://localhost:4173", "http://localhost:3000", "http://localhost:4714")
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
var documentsDirectory = Path.Combine(storageDirectory, "documents");
Directory.CreateDirectory(storageDirectory);
Directory.CreateDirectory(backupDirectory);
Directory.CreateDirectory(uploadDirectory);
Directory.CreateDirectory(documentsDirectory);

var appDatabase = new AppDatabase(Path.Combine(storageDirectory, "audit-tool.db"));
var userStore = new UserStore(appDatabase);
var auditStore = new AuditStore(appDatabase);

builder.Services.AddSingleton(appDatabase);
builder.Services.AddSingleton(userStore);
builder.Services.AddSingleton(auditStore);
builder.Services.AddSingleton(new BackupStore(backupDirectory, uploadDirectory, documentsDirectory, storageDirectory, appDatabase, userStore, auditStore));
builder.Services.AddSingleton<BackupScheduleStore>();
builder.Services.AddSingleton(new RefreshTokenStore(storageDirectory));
builder.Services.AddSingleton(new AuditLogger(storageDirectory));
builder.Services.AddHostedService<BackupService>();

var app = builder.Build();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseRouting();
app.UseCors("FrontendPolicy");
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseMiddleware<CircuitBreakerMiddleware>();
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

static int ResolveUserId(HttpContext httpContext)
{
    // Der Token enthält sowohl einen "sub"-Claim (Benutzername, wird vom JWT-Handler
    // ebenfalls auf ClaimTypes.NameIdentifier gemappt) als auch die echte numerische
    // Benutzer-ID unter demselben Claim-Typ. Daher alle Treffer durchsuchen und den
    // ersten numerisch parsebaren Wert verwenden, statt blind den ersten zu nehmen.
    foreach (var claim in httpContext.User.FindAll(ClaimTypes.NameIdentifier))
    {
        if (int.TryParse(claim.Value, out var userId))
        {
            return userId;
        }
    }

    return 0;
}

app.MapPost("/api/auth/login", (LoginRequest request, UserStore users, RefreshTokenStore refreshTokens) =>
{
    if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.BadRequest(new { message = "Benutzername und Passwort sind erforderlich." });
    }

    // Username ist case-insensitive, Passwort case-sensitive
    var user = users.Authenticate(request.Username.Trim().ToLowerInvariant(), request.Password);
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
app.MapPost("/api/categories", [Authorize(Policy = "RequireAdminAccess")] async (CreateCategoryRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Der Kategorienname ist erforderlich." });
    }

    var category = store.CreateCategory(request.Name, request.Description ?? string.Empty);
    await logger.LogActionAsync(ResolveUserId(httpContext), "Kategorie erstellt", $"Kategorie \"{category.Name}\" (ID {category.Id})");
    return Results.Ok(category);
});

app.MapPut("/api/categories/{id:int}", [Authorize(Policy = "RequireAdminAccess")] async (int id, CreateCategoryRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var updated = store.UpdateCategory(id, request.Name ?? string.Empty, request.Description ?? string.Empty);
    if (updated is null)
    {
        return Results.NotFound();
    }

    await logger.LogActionAsync(ResolveUserId(httpContext), "Kategorie bearbeitet", $"Kategorie \"{updated.Name}\" (ID {updated.Id})");
    return Results.Ok(updated);
});

app.MapDelete("/api/categories/{id:int}", [Authorize(Policy = "RequireAdminAccess")] async (int id, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var category = store.Categories.FirstOrDefault(c => c.Id == id);
    store.DeleteCategory(id);
    await logger.LogActionAsync(ResolveUserId(httpContext), "Kategorie gelöscht", category is null ? $"Kategorie ID {id}" : $"Kategorie \"{category.Name}\" (ID {id})");
    return Results.Ok(new { message = "Kategorie gelöscht." });
});

app.MapGet("/api/standorte", [Authorize] (AuditStore store) => Results.Ok(store.Sites));
app.MapPost("/api/standorte", [Authorize(Policy = "RequireAdminAccess")] async (CreateSiteRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    if (string.IsNullOrWhiteSpace(request.Name) || request.CategoryId <= 0)
    {
        return Results.BadRequest(new { message = "Name und Kategorie sind erforderlich." });
    }

    var site = store.CreateSite(request.CategoryId, request.Name, request.Address ?? string.Empty, request.Phone ?? string.Empty, request.CaretakerPhone ?? string.Empty);
    await logger.LogActionAsync(ResolveUserId(httpContext), "Standort erstellt", $"Standort \"{site.Name}\" (ID {site.Id})");
    return Results.Ok(site);
});

app.MapPut("/api/standorte/{id:int}", [Authorize(Policy = "RequireAdminAccess")] async (int id, UpdateSiteRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var updated = store.UpdateSite(
        id,
        request.CategoryId,
        request.Name ?? string.Empty,
        request.Address ?? string.Empty,
        request.Phone ?? string.Empty,
        request.CaretakerPhone ?? string.Empty,
        request.GroundDataJson);
    if (updated is null)
    {
        return Results.NotFound();
    }

    await logger.LogActionAsync(ResolveUserId(httpContext), "Standort bearbeitet", $"Standort \"{updated.Name}\" (ID {updated.Id})");
    return Results.Ok(updated);
});

app.MapPut("/api/standorte/{id:int}/grounddata", [Authorize] async (int id, UpdateGroundDataRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var updated = store.UpdateSiteGroundData(id, request.GroundDataJson ?? "{}");
    if (updated is null)
    {
        return Results.NotFound();
    }

    await logger.LogActionAsync(ResolveUserId(httpContext), "Grunddaten gespeichert", $"Standort \"{updated.Name}\" (ID {updated.Id})");
    return Results.Ok(updated);
});

app.MapDelete("/api/standorte/{id:int}", [Authorize(Policy = "RequireAdminAccess")] async (int id, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var site = store.Sites.FirstOrDefault(s => s.Id == id);
    store.DeleteSite(id);
    await logger.LogActionAsync(ResolveUserId(httpContext), "Standort gelöscht", site is null ? $"Standort ID {id}" : $"Standort \"{site.Name}\" (ID {id})");
    return Results.Ok(new { message = "Standort gelöscht." });
});

app.MapGet("/api/templates", [Authorize] (AuditStore store) => Results.Ok(store.Templates));
app.MapPost("/api/templates", [Authorize(Policy = "RequireAdminAccess")] async (CreateTemplateRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Der Vorlagenname ist erforderlich." });
    }

    var template = store.CreateTemplate(request.Name, request.Description ?? string.Empty, request.Fields ?? Array.Empty<TemplateFieldRequest>());
    await logger.LogActionAsync(ResolveUserId(httpContext), "Vorlage erstellt", $"Vorlage \"{template.Name}\" (ID {template.Id})");
    return Results.Ok(template);
});

app.MapPut("/api/templates/{id:int}", [Authorize(Policy = "RequireAdminAccess")] async (int id, CreateTemplateRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Der Vorlagenname ist erforderlich." });
    }

    var updated = store.UpdateTemplate(id, request.Name ?? string.Empty, request.Description ?? string.Empty, request.Fields ?? Array.Empty<TemplateFieldRequest>());
    if (updated is null)
    {
        return Results.NotFound();
    }

    await logger.LogActionAsync(ResolveUserId(httpContext), "Vorlage bearbeitet", $"Vorlage \"{updated.Name}\" (ID {updated.Id})");
    return Results.Ok(updated);
});

app.MapDelete("/api/templates/{id:int}", [Authorize(Policy = "RequireAdminAccess")] async (int id, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var template = store.Templates.FirstOrDefault(t => t.Id == id);
    store.DeleteTemplate(id);
    await logger.LogActionAsync(ResolveUserId(httpContext), "Vorlage gelöscht", template is null ? $"Vorlage ID {id}" : $"Vorlage \"{template.Name}\" (ID {id})");
    return Results.Ok(new { message = "Vorlage gelöscht." });
});

app.MapGet("/api/rooms", [Authorize] (AuditStore store, int? siteId, int? auditId, bool? all) =>
{
    IEnumerable<AuditRoom> query = store.Rooms;
    if (siteId.HasValue) query = query.Where(room => room.SiteId == siteId.Value);
    if (auditId.HasValue)
    {
        // Explicit snapshot lookup: rooms frozen for one specific audit (used by Dokumente-Generierung/Datenablage-Drilldown).
        query = query.Where(room => room.AuditId == auditId.Value);
    }
    else if (all != true)
    {
        // Default: only the "live" rooms currently being edited via Räume/Grunddaten (AuditId == 0).
        // Historical per-audit snapshots are only shown when explicitly requested (auditId=... or all=true).
        query = query.Where(room => room.AuditId == 0);
    }
    return Results.Ok(query.ToList());
});
app.MapPost("/api/rooms", [Authorize] async (CreateRoomRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    if (request.SiteId <= 0 || string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(new { message = "Standort und Raumname sind erforderlich." });
    }

    var room = store.CreateRoom(request.SiteId, request.Name, request.Description ?? string.Empty, request.Capacity ?? string.Empty, request.Area ?? string.Empty, request.Notes ?? string.Empty, request.FieldsJson ?? "{}");
    await logger.LogActionAsync(ResolveUserId(httpContext), "Raum erstellt", $"Raum \"{room.Name}\" (ID {room.Id}) am Standort {room.SiteId}");
    return Results.Ok(room);
});

app.MapPut("/api/rooms/{roomId:int}", [Authorize] async (int roomId, CreateRoomRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var updated = store.UpdateRoom(roomId, request.Name ?? string.Empty, request.Description ?? string.Empty, request.Capacity ?? string.Empty, request.Area ?? string.Empty, request.Notes ?? string.Empty, request.FieldsJson ?? "{}");
    if (updated is null)
    {
        return Results.NotFound();
    }

    await logger.LogActionAsync(ResolveUserId(httpContext), "Raum bearbeitet", $"Raum \"{updated.Name}\" (ID {updated.Id})");
    return Results.Ok(updated);
});

app.MapDelete("/api/rooms/{roomId:int}", [Authorize] async (int roomId, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var room = store.Rooms.FirstOrDefault(r => r.Id == roomId);
    store.DeleteRoom(roomId);
    await logger.LogActionAsync(ResolveUserId(httpContext), "Raum gelöscht", room is null ? $"Raum ID {roomId}" : $"Raum \"{room.Name}\" (ID {roomId})");
    return Results.Ok(new { message = "Raum gelöscht." });
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

app.MapDelete("/api/audits/{auditId:int}", [Authorize] async (int auditId, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var audit = store.Audits.FirstOrDefault(a => a.Id == auditId);
    if (audit is null) return Results.NotFound();

    // Dokumentdateien der Festplatte vor dem Entfernen der Datensätze löschen (best-effort).
    var removedDocuments = store.DeleteAudit(auditId);
    foreach (var doc in removedDocuments)
    {
        var fullPath = Path.Combine(documentsDirectory, doc.FileName);
        if (File.Exists(fullPath))
        {
            try { File.Delete(fullPath); } catch { /* best-effort */ }
        }
    }

    await logger.LogActionAsync(ResolveUserId(httpContext), "Audit gelöscht", $"Audit \"{audit.Title}\" (ID {auditId}) inkl. {removedDocuments.Count} zugehörigem(n) Dokument(en)");
    return Results.Ok(new { message = "Audit gelöscht." });
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

app.MapGet("/api/audits/{auditId:int}/checklist", [Authorize] (AuditStore store, int auditId) =>
    Results.Ok(store.ChecklistEntries.Where(e => e.AuditId == auditId).ToList()));

app.MapPut("/api/audits/{auditId:int}/checklist/{entryId:int}", [Authorize] (AuditStore store, int auditId, int entryId, UpdateChecklistEntryRequest request) =>
{
    var updated = store.UpdateChecklistEntry(entryId, request.Answer, request.Status);
    if (updated is null) return Results.NotFound();
    return Results.Ok(updated);
});

// PDF Designs
app.MapGet("/api/pdfdesigns", [Authorize] (AuditStore store) => Results.Ok(store.PdfDesigns));
app.MapGet("/api/pdfdesigns/{id:int}", [Authorize] (AuditStore store, int id) =>
{
    var design = store.PdfDesigns.FirstOrDefault(d => d.Id == id);
    return design is null ? Results.NotFound() : Results.Ok(design);
});
app.MapPost("/api/pdfdesigns", [Authorize(Policy = "RequireAdminAccess")] async (AuditStore store, CreatePdfDesignRequest request, AuditLogger logger, HttpContext httpContext) =>
{
    if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest(new { message = "Name erforderlich." });
    var design = store.CreatePdfDesign(request.Name, request.Description ?? string.Empty, request.ConfigJson ?? "{}");
    await logger.LogActionAsync(ResolveUserId(httpContext), "PDF-Design erstellt", $"Design \"{design.Name}\" (ID {design.Id})");
    return Results.Ok(design);
});
app.MapPut("/api/pdfdesigns/{id:int}", [Authorize(Policy = "RequireAdminAccess")] async (AuditStore store, int id, CreatePdfDesignRequest request, AuditLogger logger, HttpContext httpContext) =>
{
    var design = store.UpdatePdfDesign(id, request.Name ?? string.Empty, request.Description ?? string.Empty, request.ConfigJson ?? "{}");
    if (design is null) return Results.NotFound();
    await logger.LogActionAsync(ResolveUserId(httpContext), "PDF-Design bearbeitet", $"Design \"{design.Name}\" (ID {design.Id})");
    return Results.Ok(design);
});
app.MapDelete("/api/pdfdesigns/{id:int}", [Authorize(Policy = "RequireAdminAccess")] async (AuditStore store, int id, AuditLogger logger, HttpContext httpContext) =>
{
    var design = store.PdfDesigns.FirstOrDefault(d => d.Id == id);
    store.DeletePdfDesign(id);
    await logger.LogActionAsync(ResolveUserId(httpContext), "PDF-Design gelöscht", design is null ? $"Design ID {id}" : $"Design \"{design.Name}\" (ID {id})");
    return Results.Ok(new { message = "Design gelöscht." });
});

// Checkliste Templates
app.MapGet("/api/checklisttemplates", [Authorize] (AuditStore store) => Results.Ok(store.ChecklistTemplates));
app.MapPost("/api/checklisttemplates", [Authorize(Policy = "RequireAdminAccess")] async (AuditStore store, CreateChecklistTemplateRequest request, AuditLogger logger, HttpContext httpContext) =>
{
    if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest(new { message = "Name erforderlich." });
    var tmpl = store.CreateChecklistTemplate(request.Name, request.TemplateId ?? 0, request.ColumnsJson ?? "[]");
    await logger.LogActionAsync(ResolveUserId(httpContext), "Checklisten-Vorlage erstellt", $"Checkliste \"{tmpl.Name}\" (ID {tmpl.Id})");
    return Results.Ok(tmpl);
});
app.MapPut("/api/checklisttemplates/{id:int}", [Authorize(Policy = "RequireAdminAccess")] async (AuditStore store, int id, CreateChecklistTemplateRequest request, AuditLogger logger, HttpContext httpContext) =>
{
    var tmpl = store.UpdateChecklistTemplate(id, request.Name ?? string.Empty, request.TemplateId ?? 0, request.ColumnsJson ?? "[]");
    if (tmpl is null) return Results.NotFound();
    await logger.LogActionAsync(ResolveUserId(httpContext), "Checklisten-Vorlage bearbeitet", $"Checkliste \"{tmpl.Name}\" (ID {tmpl.Id})");
    return Results.Ok(tmpl);
});
app.MapDelete("/api/checklisttemplates/{id:int}", [Authorize(Policy = "RequireAdminAccess")] async (AuditStore store, int id, AuditLogger logger, HttpContext httpContext) =>
{
    var tmpl = store.ChecklistTemplates.FirstOrDefault(c => c.Id == id);
    store.DeleteChecklistTemplate(id);
    await logger.LogActionAsync(ResolveUserId(httpContext), "Checklisten-Vorlage gelöscht", tmpl is null ? $"Checkliste ID {id}" : $"Checkliste \"{tmpl.Name}\" (ID {id})");
    return Results.Ok(new { message = "Checkliste gelöscht." });
});

// Checkliste Live-Werte (die "freien" Spaltenwerte je Raum, 10s-Polling im Frontend für den Mehrbenutzer-Sync)
app.MapGet("/api/checklist-values", [Authorize] (AuditStore store, int? checklistTemplateId) =>
{
    var values = checklistTemplateId.HasValue
        ? store.ChecklistValues.Where(v => v.ChecklistTemplateId == checklistTemplateId.Value)
        : store.ChecklistValues;
    return Results.Ok(values.ToList());
});
app.MapPut("/api/checklist-values", [Authorize] (AuditStore store, UpsertChecklistValueRequest request) =>
{
    if (request.ChecklistTemplateId <= 0 || request.RoomId <= 0)
    {
        return Results.BadRequest(new { message = "Checkliste und Raum sind erforderlich." });
    }
    var value = store.UpsertChecklistValue(request.ChecklistTemplateId, request.RoomId, request.DataJson ?? "{}");
    return Results.Ok(value);
});

// Dokumentenablage: Ordner
app.MapGet("/api/folders", [Authorize] (AuditStore store, int? siteId) =>
    Results.Ok(siteId.HasValue ? store.Folders.Where(f => f.SiteId == siteId.Value).ToList() : store.Folders));

app.MapPost("/api/folders", [Authorize] async (AuditStore store, CreateFolderRequest request, int siteId, AuditLogger logger, HttpContext httpContext) =>
{
    if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest(new { message = "Ordnername ist erforderlich." });
    var folder = store.CreateFolder(siteId, request.Name.Trim(), request.ParentFolderId ?? 0);
    await logger.LogActionAsync(ResolveUserId(httpContext), "Ordner erstellt", $"Ordner \"{folder.Name}\" (ID {folder.Id})");
    return Results.Ok(folder);
});

app.MapDelete("/api/folders/{id:int}", [Authorize] async (AuditStore store, int id, AuditLogger logger, HttpContext httpContext) =>
{
    var folder = store.Folders.FirstOrDefault(f => f.Id == id);
    if (!store.DeleteFolder(id)) return Results.NotFound();
    await logger.LogActionAsync(ResolveUserId(httpContext), "Ordner gelöscht", folder is null ? $"Ordner ID {id}" : $"Ordner \"{folder.Name}\" (ID {id})");
    return Results.Ok(new { message = "Ordner gelöscht." });
});

// Dokumentenablage: Dokumente (generierte PDFs aus PDF-Designs + hochgeladene Fremddokumente)
app.MapGet("/api/documents", [Authorize] (AuditStore store, int? siteId, int? auditId) =>
{
    IEnumerable<AuditDocument> query = store.Documents;
    if (siteId.HasValue) query = query.Where(d => d.SiteId == siteId.Value);
    if (auditId.HasValue) query = query.Where(d => d.AuditId == auditId.Value);
    return Results.Ok(query.OrderByDescending(d => d.CreatedAtUtc).ToList());
});

app.MapPost("/api/audits/{auditId:int}/documents/generate", [Authorize] async (int auditId, GenerateDocumentRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var audit = store.Audits.FirstOrDefault(a => a.Id == auditId);
    if (audit is null) return Results.NotFound(new { message = "Audit nicht gefunden." });
    if (string.IsNullOrWhiteSpace(request.Title)) return Results.BadRequest(new { message = "Titel ist erforderlich." });
    if (!request.PdfDesignId.HasValue) return Results.BadRequest(new { message = "Bitte ein PDF-Design auswählen." });

    var design = store.PdfDesigns.FirstOrDefault(d => d.Id == request.PdfDesignId.Value);
    if (design is null) return Results.NotFound(new { message = "PDF-Design nicht gefunden." });

    var site = store.Sites.FirstOrDefault(s => s.Id == audit.SiteId);
    var category = site is null ? null : store.Categories.FirstOrDefault(c => c.Id == site.CategoryId);
    var template = store.Templates.FirstOrDefault(t => t.Id == audit.TemplateId);
    var snapshotRoomsRaw = store.Rooms.Where(r => r.AuditId == auditId).ToList();

    // Keys must match the {{variable}} placeholders offered by the frontend PDF designer (PdfDesignerCanvas.tsx).
    var variables = new Dictionary<string, string>
    {
        ["{{siteName}}"] = site?.Name ?? string.Empty,
        ["{{category}}"] = category?.Name ?? string.Empty,
        ["{{address}}"] = site?.Address ?? string.Empty,
        ["{{phone}}"] = site?.Phone ?? string.Empty,
        ["{{caretakerPhone}}"] = site?.CaretakerPhone ?? string.Empty,
        ["{{auditTitle}}"] = audit.Title,
        ["{{date}}"] = audit.CreatedAtUtc.ToString("dd.MM.yyyy"),
        ["{{createdBy}}"] = audit.CreatedBy,
        ["{{totalRooms}}"] = snapshotRoomsRaw.Count.ToString()
    };

    var snapshotRooms = snapshotRoomsRaw
        .Select(r =>
        {
            Dictionary<string, string> fields;
            try { fields = JsonSerializer.Deserialize<Dictionary<string, string>>(r.FieldsJson) ?? new(); }
            catch { fields = new(); }
            return new PdfDesignRenderer.RoomRenderData(r.Name, fields);
        })
        .ToList();

    var fieldTypesByName = (template?.Fields ?? Enumerable.Empty<TemplateField>())
        .GroupBy(f => f.Name)
        .ToDictionary(g => g.Key, g => g.First().Type);

    byte[] pdfBytes;
    try
    {
        var config = PdfDesignRenderer.ParseConfig(design.ConfigJson);
        pdfBytes = PdfDesignRenderer.Render(config, variables, snapshotRooms, fieldTypesByName);
    }
    catch (Exception ex)
    {
        return Results.Problem($"PDF konnte nicht erstellt werden: {ex.Message}");
    }

    var safeFileName = $"{Guid.NewGuid():N}.pdf";
    var folderPath = Path.Combine(documentsDirectory, audit.SiteId.ToString());
    Directory.CreateDirectory(folderPath);
    await File.WriteAllBytesAsync(Path.Combine(folderPath, safeFileName), pdfBytes);

    var document = store.AddDocument(auditId, audit.SiteId, request.Title.Trim(), design.Id, design.Name, Path.Combine(audit.SiteId.ToString(), safeFileName), pdfBytes.LongLength, request.FolderId ?? 0);
    await logger.LogActionAsync(ResolveUserId(httpContext), "Dokument erstellt", $"Dokument \"{document.Title}\" für Audit \"{audit.Title}\" (ID {document.Id})");
    return Results.Ok(document);
});

app.MapPost("/api/documents/upload", [Authorize] async (HttpRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    if (!request.HasFormContentType) return Results.BadRequest(new { message = "Multipart-Formular erwartet." });

    var form = await request.ReadFormAsync();
    var file = form.Files.FirstOrDefault();
    if (file is null || file.Length == 0) return Results.BadRequest(new { message = "Keine Datei hochgeladen." });

    if (!int.TryParse(form["siteId"], out var siteId) || siteId <= 0)
        return Results.BadRequest(new { message = "Standort ist erforderlich." });

    var title = form["title"].ToString();
    if (string.IsNullOrWhiteSpace(title)) title = Path.GetFileNameWithoutExtension(file.FileName);
    int.TryParse(form["folderId"], out var folderId);

    var safeFileName = $"{Guid.NewGuid():N}{Path.GetExtension(file.FileName)}";
    var folderPath = Path.Combine(documentsDirectory, siteId.ToString());
    Directory.CreateDirectory(folderPath);
    var fullPath = Path.Combine(folderPath, safeFileName);
    await using (var output = File.Create(fullPath))
    {
        await file.CopyToAsync(output);
    }

    var document = store.AddDocument(0, siteId, title.Trim(), null, null, Path.Combine(siteId.ToString(), safeFileName), file.Length, folderId, isUploaded: true);
    await logger.LogActionAsync(ResolveUserId(httpContext), "Dokument hochgeladen", $"Dokument \"{document.Title}\" (ID {document.Id})");
    return Results.Ok(document);
});

app.MapPut("/api/documents/{id:int}", [Authorize] async (int id, UpdateDocumentRequest request, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var document = store.UpdateDocument(id, request.Title?.Trim(), request.FolderId, request.IsArchived);
    if (document is null) return Results.NotFound();
    await logger.LogActionAsync(ResolveUserId(httpContext), "Dokument bearbeitet", $"Dokument \"{document.Title}\" (ID {document.Id})");
    return Results.Ok(document);
});

app.MapGet("/api/documents/{id:int}/view", [Authorize] (int id, AuditStore store) =>
{
    var document = store.Documents.FirstOrDefault(d => d.Id == id);
    if (document is null) return Results.NotFound();
    var fullPath = Path.Combine(documentsDirectory, document.FileName);
    if (!File.Exists(fullPath)) return Results.NotFound(new { message = "Datei nicht gefunden." });
    var bytes = File.ReadAllBytes(fullPath);
    var ext = Path.GetExtension(document.FileName).ToLowerInvariant();
    var contentType = ext switch
    {
        ".pdf" => "application/pdf",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        _ => "application/octet-stream"
    };
    // Kein Dateiname => kein "attachment"-Header, Browser zeigt PDFs/Bilder inline an statt sie herunterzuladen.
    return Results.File(bytes, contentType);
});

app.MapGet("/api/documents/{id:int}/download", [Authorize] (int id, AuditStore store) =>
{
    var document = store.Documents.FirstOrDefault(d => d.Id == id);
    if (document is null) return Results.NotFound();
    var fullPath = Path.Combine(documentsDirectory, document.FileName);
    if (!File.Exists(fullPath)) return Results.NotFound(new { message = "Datei nicht gefunden." });
    var bytes = File.ReadAllBytes(fullPath);
    var ext = Path.GetExtension(document.FileName).ToLowerInvariant();
    var contentType = ext switch
    {
        ".pdf" => "application/pdf",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".doc" => "application/msword",
        ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls" => "application/vnd.ms-excel",
        ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        _ => "application/octet-stream"
    };
    return Results.File(bytes, contentType, $"{document.Title}{ext}");
});

app.MapDelete("/api/documents/{id:int}", [Authorize] async (int id, AuditStore store, AuditLogger logger, HttpContext httpContext) =>
{
    var document = store.Documents.FirstOrDefault(d => d.Id == id);
    if (document is null) return Results.NotFound();
    var fullPath = Path.Combine(documentsDirectory, document.FileName);
    if (File.Exists(fullPath))
    {
        try { File.Delete(fullPath); } catch { /* best-effort */ }
    }
    store.DeleteDocument(id);
    await logger.LogActionAsync(ResolveUserId(httpContext), "Dokument gelöscht", $"Dokument \"{document.Title}\" (ID {id})");
    return Results.Ok(new { message = "Dokument gelöscht." });
});

app.MapGet("/api/users", [Authorize(Policy = "RequireAdminAccess")] (UserStore users) =>
    Results.Ok(users.All.Select(u => new UserSummary(u.Id, u.UserName, u.DisplayName, u.Role, u.IsActive))));

app.MapPost("/api/users", [Authorize(Policy = "RequireAdminAccess")] async (CreateUserRequest request, UserStore users, AuditLogger logger, HttpContext httpContext) =>
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
    await logger.LogActionAsync(ResolveUserId(httpContext), "Benutzer erstellt", $"Benutzer \"{user.UserName}\" (ID {user.Id}, Rolle {user.Role})");
    return Results.Ok(new { user = new UserSummary(user.Id, user.UserName, user.DisplayName, user.Role, user.IsActive) });
});

app.MapPut("/api/users/{userId:int}/password", [Authorize(Policy = "RequireAdminAccess")] async (int userId, ResetPasswordRequest request, UserStore users, AuditLogger logger, HttpContext httpContext) =>
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
    await logger.LogActionAsync(ResolveUserId(httpContext), "Passwort zurückgesetzt", $"Benutzer \"{targetUser.UserName}\" (ID {targetUser.Id})");
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

    if (!users.VerifyPassword(user, request.CurrentPassword))
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

app.MapPut("/api/users/{userId:int}/toggle", [Authorize(Policy = "RequireAdminAccess")] async (int userId, UserStore users, AuditLogger logger, HttpContext httpContext) =>
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
    await logger.LogActionAsync(ResolveUserId(httpContext), "Benutzerstatus geändert", $"Benutzer \"{updated!.UserName}\" (ID {updated.Id}) ist jetzt {(updated.IsActive ? "aktiv" : "inaktiv")}");
    return Results.Ok(new { user = new UserSummary(updated!.Id, updated.UserName, updated.DisplayName, updated.Role, updated.IsActive) });
});

app.MapDelete("/api/users/{userId:int}", [Authorize(Policy = "RequireAdminAccess")] async (int userId, UserStore users, AuditLogger logger, HttpContext httpContext) =>
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
    await logger.LogActionAsync(ResolveUserId(httpContext), "Benutzer gelöscht", $"Benutzer \"{targetUser.UserName}\" (ID {userId})");
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

app.MapGet("/api/admin/backups/{backupId}/download", [Authorize(Policy = "RequireAdminAccess")] (string backupId, BackupStore backups) =>
{
    var filePath = backups.GetFilePath(backupId);
    if (filePath is null || !File.Exists(filePath))
        return Results.NotFound(new { message = "Backup nicht gefunden." });

    var bytes = File.ReadAllBytes(filePath);
    var fileName = Path.GetFileName(filePath);
    return Results.File(bytes, "application/zip", fileName);
});

app.MapPost("/api/admin/backups/upload", [Authorize(Policy = "RequireAdminAccess")] async (HttpRequest request, BackupStore backups, AuditStore store) =>
{
    if (!request.HasFormContentType)
        return Results.BadRequest(new { message = "Multipart-Formular erwartet." });

    var form = await request.ReadFormAsync();
    var file = form.Files.FirstOrDefault();
    if (file is null || file.Length == 0)
        return Results.BadRequest(new { message = "Keine Datei hochgeladen." });

    var backup = await backups.Upload(file);
    return Results.Ok(backup);
});

app.MapGet("/api/admin/logs", [Authorize(Policy = "RequireAdminAccess")] async (AuditLogger logger, UserStore users, int? limit) =>
{
    var logs = await logger.GetLogsAsync(limit: limit ?? 200);
    var userNames = users.All.ToDictionary(u => u.Id, u => u.UserName);
    var enriched = logs.OrderByDescending(l => l.Timestamp).Select(l => new
    {
        l.Timestamp,
        l.UserId,
        userName = l.UserId == 0 ? "System" : (userNames.TryGetValue(l.UserId, out var name) ? name : $"Benutzer #{l.UserId}"),
        l.Action,
        l.Details,
        l.IpAddress
    }).ToList();
    return Results.Ok(enriched);
});

app.MapGet("/api/admin/export/zip", [Authorize(Policy = "RequireAdminAccess")] (AuditStore store, int? siteId, HttpContext httpContext) =>
{
    var exportDirectory = Path.Combine(builder.Environment.ContentRootPath, "..", "storage", "exports");
    Directory.CreateDirectory(exportDirectory);

    // Kein übergebener siteId => echter Gesamtexport (alle Standorte), statt wie zuvor versehentlich auf
    // den ersten Standort der Liste zu filtern.
    var siteFilter = siteId;
    var fileName = $"audit-export-{DateTime.UtcNow:yyyyMMdd_HHmmss}.zip";
    var path = Path.Combine(exportDirectory, fileName);

    static string CsvEscape(string? value)
    {
        var v = value ?? string.Empty;
        return (v.Contains(';') || v.Contains('"') || v.Contains('\n') || v.Contains('\r'))
            ? "\"" + v.Replace("\"", "\"\"") + "\""
            : v;
    }

    using (var archiveStream = File.Create(path))
    using (var archive = new ZipArchive(archiveStream, ZipArchiveMode.Create, leaveOpen: true))
    {
        foreach (var category in store.Categories)
        {
            foreach (var site in store.Sites.Where(s => s.CategoryId == category.Id && (!siteFilter.HasValue || s.Id == siteFilter.Value)))
            {
                var siteFolder = $"{BackupStore.SanitizeFileName(category.Name)}/{BackupStore.SanitizeFileName(site.Name)}";

                // Nur Live-Räume (AuditId == 0) exportieren - eingefrorene Audit-Snapshots sind historische
                // Duplikate bereits bearbeiteter/gelöschter Räume und gehören nicht in den Datenexport.
                var roomFields = store.Rooms.Where(r => r.SiteId == site.Id && r.AuditId == 0)
                    .Select(r =>
                    {
                        Dictionary<string, string> fields;
                        try { fields = JsonSerializer.Deserialize<Dictionary<string, string>>(r.FieldsJson) ?? new(); }
                        catch { fields = new(); }
                        return (Room: r, Fields: fields);
                    })
                    .ToList();

                // Alle nicht-Bild-Feldnamen über alle Räume sammeln, für eine einheitliche CSV-Kopfzeile.
                var textFieldNames = roomFields
                    .SelectMany(x => x.Fields)
                    .Where(kv => !kv.Value.Contains("data:image", StringComparison.OrdinalIgnoreCase))
                    .Select(kv => kv.Key)
                    .Distinct()
                    .ToList();

                if (roomFields.Count > 0)
                {
                    var csv = new StringBuilder();
                    csv.Append("Raumname;Beschreibung;Kapazität;Fläche;Notizen");
                    foreach (var fieldName in textFieldNames) csv.Append(';').Append(CsvEscape(fieldName));
                    csv.Append("\r\n");

                    foreach (var (room, fields) in roomFields)
                    {
                        csv.Append(CsvEscape(room.Name)).Append(';')
                           .Append(CsvEscape(room.Description)).Append(';')
                           .Append(CsvEscape(room.Capacity)).Append(';')
                           .Append(CsvEscape(room.Area)).Append(';')
                           .Append(CsvEscape(room.Notes));
                        foreach (var fieldName in textFieldNames)
                        {
                            csv.Append(';').Append(CsvEscape(fields.TryGetValue(fieldName, out var fieldValue) ? fieldValue : ""));
                        }
                        csv.Append("\r\n");
                    }

                    var csvEntry = archive.CreateEntry($"{siteFolder}/Raeume.csv");
                    using var csvStream = new StreamWriter(csvEntry.Open(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
                    csvStream.Write(csv.ToString());
                }

                // Bilder je Raum in einen eigenen Unterordner je Raum extrahieren (echte Dateien statt Base64 in der CSV/JSON).
                foreach (var (room, fields) in roomFields)
                {
                    var roomImageFolder = $"{siteFolder}/{BackupStore.SanitizeFileName(room.Name)}";
                    foreach (var (key, value) in fields)
                    {
                        if (string.IsNullOrWhiteSpace(value) || !value.Contains("data:image", StringComparison.OrdinalIgnoreCase)) continue;
                        var images = value.Split("||", StringSplitOptions.RemoveEmptyEntries);
                        for (var i = 0; i < images.Length; i++)
                        {
                            BackupStore.WriteDataUrlImage(archive, roomImageFolder, BackupStore.SanitizeFileName(key), i, images[i]);
                        }
                    }
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
                rooms = store.Rooms.Where(r => r.AuditId == 0),
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
    public string DatabasePath => _databasePath;

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
    private readonly List<PdfDesign> _pdfDesigns;
    private readonly List<ChecklistTemplate> _checklistTemplates;
    private readonly List<AuditDocument> _documents;
    private readonly List<DocumentFolder> _folders;
    private readonly List<ChecklistValue> _checklistValues;

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
        _pdfDesigns = _database.Load("pdf_designs", new List<PdfDesign>());
        _checklistTemplates = _database.Load("checklist_templates", new List<ChecklistTemplate>());
        _documents = _database.Load("audit_documents", new List<AuditDocument>());
        _folders = _database.Load("document_folders", new List<DocumentFolder>());
        _checklistValues = _database.Load("checklist_values", new List<ChecklistValue>());

        RemoveLegacySeedAudits();
    }

    // One-time cleanup: older builds always seeded two demo audit/document records at startup, which ended up
    // permanently attached to real sites (e.g. "Steinweg Berufsschule"). Remove them if they are still untouched.
    private void RemoveLegacySeedAudits()
    {
        var removed = _audits.RemoveAll(a =>
            (a.Id == 1 && a.Title == "Jahresaudit Gebäude A" && a.CreatedBy == "superadmin") ||
            (a.Id == 2 && a.Title == "Audit Schulungsräume" && a.CreatedBy == "admin"));
        if (removed > 0)
        {
            _checklistEntries.RemoveAll(e => e.AuditId == 1 || e.AuditId == 2);
            Persist();
        }
    }

    public IReadOnlyList<AuditCategory> Categories => _categories;
    public IReadOnlyList<AuditSite> Sites => _sites;
    public IReadOnlyList<AuditTemplate> Templates => _templates;
    public IReadOnlyList<AuditRoom> Rooms => _rooms;
    public IReadOnlyList<AuditObject> Objects => _objects;
    public IReadOnlyList<AuditInstance> Audits => _audits;
    public IReadOnlyList<AuditDocument> Documents => _documents;
    public IReadOnlyList<DocumentFolder> Folders => _folders;
    public IReadOnlyList<ChecklistValue> ChecklistValues => _checklistValues;

    private void Persist()
    {
        _database.Save("audit_categories", _categories);
        _database.Save("audit_sites", _sites);
        _database.Save("audit_templates", _templates);
        _database.Save("audit_rooms", _rooms);
        _database.Save("audit_objects", _objects);
        _database.Save("audit_instances", _audits);
        _database.Save("audit_checklist_entries", _checklistEntries);
        _database.Save("pdf_designs", _pdfDesigns);
        _database.Save("checklist_templates", _checklistTemplates);
        _database.Save("audit_documents", _documents);
        _database.Save("document_folders", _folders);
        _database.Save("checklist_values", _checklistValues);
    }

    // Re-reads every collection from the (possibly just restored) database file. Used after a backup restore.
    public void ReloadFromDatabase()
    {
        ReplaceAll(_categories, _database.Load("audit_categories", CreateInitialCategories()));
        ReplaceAll(_sites, _database.Load("audit_sites", CreateInitialSites()));
        ReplaceAll(_templates, _database.Load("audit_templates", CreateInitialTemplates()));
        ReplaceAll(_rooms, _database.Load("audit_rooms", CreateInitialRooms()));
        ReplaceAll(_objects, _database.Load("audit_objects", CreateInitialObjects()));
        ReplaceAll(_audits, _database.Load("audit_instances", CreateInitialAudits()));
        ReplaceAll(_checklistEntries, _database.Load("audit_checklist_entries", CreateInitialChecklistEntries()));
        ReplaceAll(_pdfDesigns, _database.Load("pdf_designs", new List<PdfDesign>()));
        ReplaceAll(_checklistTemplates, _database.Load("checklist_templates", new List<ChecklistTemplate>()));
        ReplaceAll(_documents, _database.Load("audit_documents", new List<AuditDocument>()));
        ReplaceAll(_folders, _database.Load("document_folders", new List<DocumentFolder>()));
        ReplaceAll(_checklistValues, _database.Load("checklist_values", new List<ChecklistValue>()));
    }

    private static void ReplaceAll<T>(List<T> target, List<T> source)
    {
        target.Clear();
        target.AddRange(source);
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
        var site = new AuditSite(id, categoryId, name, address, phone, caretakerPhone, true)
        {
            GroundDataJson = "{}"
        };
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

    public AuditRoom CreateRoom(int siteId, string name, string description, string capacity, string area, string notes, string fieldsJson = "{}")
    {
        var id = _rooms.Count == 0 ? 1 : _rooms.Max(x => x.Id) + 1;
        var room = new AuditRoom(id, siteId, name, description, capacity, area, notes) { FieldsJson = fieldsJson };
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
        var site = _sites.FirstOrDefault(s => s.Id == siteId);
        var groundDataJson = site?.GroundDataJson ?? "{}";
        var audit = new AuditInstance(id, siteId, templateId, title, templateName, createdBy, DateTime.UtcNow, "In Bearbeitung", Array.Empty<AuditChecklistEntry>())
        {
            GroundDataJson = groundDataJson
        };
        _audits.Add(audit);

        // Freeze the current state of all live rooms (AuditId == 0) for this site into this audit's own
        // room snapshot, so later edits to the live rooms never change what this audit's documents show.
        var liveRooms = _rooms.Where(r => r.SiteId == siteId && r.AuditId == 0).ToList();
        var nextRoomId = _rooms.Count == 0 ? 1 : _rooms.Max(r => r.Id) + 1;
        foreach (var liveRoom in liveRooms)
        {
            var snapshot = liveRoom with { Id = nextRoomId++, AuditId = id };
            _rooms.Add(snapshot);
        }

        Persist();
        return audit;
    }

    // Löscht ein Audit vollständig samt allem, was ausschließlich daran hängt: der zum Erstellzeitpunkt
    // eingefrorene Raum-Snapshot (AuditId == id), seine Checklisten-Einträge und die daraus generierten/
    // zugeordneten Dokumente. Live-Räume (AuditId == 0) und andere Audits bleiben unberührt. Gibt die
    // gelöschten Dokumente zurück, damit der Aufrufer auch ihre Dateien auf der Festplatte entfernen kann.
    public IReadOnlyList<AuditDocument> DeleteAudit(int id)
    {
        var removedDocuments = _documents.Where(d => d.AuditId == id).ToList();
        if (_audits.RemoveAll(a => a.Id == id) > 0)
        {
            _rooms.RemoveAll(r => r.AuditId == id);
            _checklistEntries.RemoveAll(e => e.AuditId == id);
            _documents.RemoveAll(d => d.AuditId == id);
            Persist();
        }
        return removedDocuments;
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

    public AuditChecklistEntry? UpdateChecklistEntry(int entryId, string? answer, string? status)
    {
        var idx = _checklistEntries.FindIndex(e => e.Id == entryId);
        if (idx < 0) return null;
        var existing = _checklistEntries[idx];
        var updated = existing with { Answer = answer ?? existing.Answer, Status = status ?? existing.Status };
        _checklistEntries[idx] = updated;
        Persist();
        return updated;
    }

    public IReadOnlyList<AuditChecklistEntry> ChecklistEntries => _checklistEntries;
    public IReadOnlyList<PdfDesign> PdfDesigns => _pdfDesigns;
    public IReadOnlyList<ChecklistTemplate> ChecklistTemplates => _checklistTemplates;

    public PdfDesign CreatePdfDesign(string name, string description, string configJson)
    {
        var id = _pdfDesigns.Count == 0 ? 1 : _pdfDesigns.Max(x => x.Id) + 1;
        var design = new PdfDesign(id, name, description, configJson, DateTime.UtcNow);
        _pdfDesigns.Add(design);
        Persist();
        return design;
    }

    public PdfDesign? UpdatePdfDesign(int id, string name, string description, string configJson)
    {
        var idx = _pdfDesigns.FindIndex(d => d.Id == id);
        if (idx < 0) return null;
        var updated = _pdfDesigns[idx] with { Name = name, Description = description, ConfigJson = configJson };
        _pdfDesigns[idx] = updated;
        Persist();
        return updated;
    }

    public void DeletePdfDesign(int id) { _pdfDesigns.RemoveAll(d => d.Id == id); Persist(); }

    public ChecklistTemplate CreateChecklistTemplate(string name, int templateId, string columnsJson)
    {
        var id = _checklistTemplates.Count == 0 ? 1 : _checklistTemplates.Max(x => x.Id) + 1;
        var tmpl = new ChecklistTemplate(id, name, templateId, columnsJson, DateTime.UtcNow);
        _checklistTemplates.Add(tmpl);
        Persist();
        return tmpl;
    }

    public ChecklistTemplate? UpdateChecklistTemplate(int id, string name, int templateId, string columnsJson)
    {
        var idx = _checklistTemplates.FindIndex(t => t.Id == id);
        if (idx < 0) return null;
        var updated = _checklistTemplates[idx] with { Name = name, TemplateId = templateId, ColumnsJson = columnsJson };
        _checklistTemplates[idx] = updated;
        Persist();
        return updated;
    }

    public void DeleteChecklistTemplate(int id) { _checklistTemplates.RemoveAll(t => t.Id == id); Persist(); }

    // Speichert/aktualisiert die "freien" Spaltenwerte (source:'custom') einer Checkliste für einen Raum.
    // Spalten mit source 'room'/'field' werden nicht hier gespeichert - sie werden live aus den Raumdaten
    // abgeleitet und müssen daher nicht persistiert werden.
    public ChecklistValue UpsertChecklistValue(int checklistTemplateId, int roomId, string dataJson)
    {
        var idx = _checklistValues.FindIndex(v => v.ChecklistTemplateId == checklistTemplateId && v.RoomId == roomId);
        if (idx >= 0)
        {
            var updated = _checklistValues[idx] with { DataJson = dataJson, UpdatedAtUtc = DateTime.UtcNow };
            _checklistValues[idx] = updated;
            Persist();
            return updated;
        }

        var id = _checklistValues.Count == 0 ? 1 : _checklistValues.Max(v => v.Id) + 1;
        var value = new ChecklistValue(id, checklistTemplateId, roomId, dataJson, DateTime.UtcNow);
        _checklistValues.Add(value);
        Persist();
        return value;
    }

    public DocumentFolder CreateFolder(int siteId, string name, int parentFolderId)
    {
        var id = _folders.Count == 0 ? 1 : _folders.Max(x => x.Id) + 1;
        var folder = new DocumentFolder(id, siteId, parentFolderId, name, DateTime.UtcNow);
        _folders.Add(folder);
        Persist();
        return folder;
    }

    public bool DeleteFolder(int id)
    {
        var removed = _folders.RemoveAll(f => f.Id == id);
        if (removed > 0)
        {
            // Move any documents that were inside the deleted folder back to the root level.
            for (var i = 0; i < _documents.Count; i++)
            {
                if (_documents[i].FolderId == id)
                {
                    _documents[i] = _documents[i] with { FolderId = 0 };
                }
            }
            Persist();
        }
        return removed > 0;
    }

    public AuditDocument AddDocument(int auditId, int siteId, string title, int? pdfDesignId, string? pdfDesignName, string fileName, long sizeBytes, int folderId, bool isUploaded = false)
    {
        var id = _documents.Count == 0 ? 1 : _documents.Max(x => x.Id) + 1;
        var document = new AuditDocument(id, auditId, siteId, title, pdfDesignId, pdfDesignName, fileName, sizeBytes, DateTime.UtcNow, false, isUploaded, folderId);
        _documents.Add(document);
        Persist();
        return document;
    }

    public AuditDocument? UpdateDocument(int id, string? title, int? folderId, bool? isArchived)
    {
        var idx = _documents.FindIndex(d => d.Id == id);
        if (idx < 0) return null;
        var updated = _documents[idx] with
        {
            Title = title ?? _documents[idx].Title,
            FolderId = folderId ?? _documents[idx].FolderId,
            IsArchived = isArchived ?? _documents[idx].IsArchived
        };
        _documents[idx] = updated;
        Persist();
        return updated;
    }

    public bool DeleteDocument(int id)
    {
        var removed = _documents.RemoveAll(d => d.Id == id);
        if (removed > 0) Persist();
        return removed > 0;
    }

    public AuditCategory? UpdateCategory(int id, string name, string description)
    {
        var idx = _categories.FindIndex(c => c.Id == id);
        if (idx < 0) return null;
        var updated = _categories[idx] with { Name = name, Description = description };
        _categories[idx] = updated;
        // Propagate rename to no extra fields needed (sites reference by CategoryId)
        Persist();
        return updated;
    }

    public void DeleteCategory(int id) { _categories.RemoveAll(c => c.Id == id); Persist(); }

    public AuditSite? UpdateSite(int id, int categoryId, string name, string address, string phone, string caretakerPhone, string? groundDataJson = null)
    {
        var idx = _sites.FindIndex(s => s.Id == id);
        if (idx < 0) return null;
        var updated = _sites[idx] with
        {
            CategoryId = categoryId,
            Name = name,
            Address = address,
            Phone = phone,
            CaretakerPhone = caretakerPhone,
            GroundDataJson = groundDataJson ?? _sites[idx].GroundDataJson
        };
        _sites[idx] = updated;
        Persist();
        return updated;
    }

    public AuditSite? UpdateSiteGroundData(int id, string groundDataJson)
    {
        var idx = _sites.FindIndex(s => s.Id == id);
        if (idx < 0) return null;
        var updated = _sites[idx] with { GroundDataJson = string.IsNullOrWhiteSpace(groundDataJson) ? "{}" : groundDataJson };
        _sites[idx] = updated;
        Persist();
        return updated;
    }

    public void DeleteSite(int id) { _sites.RemoveAll(s => s.Id == id); Persist(); }

    public AuditTemplate? UpdateTemplate(int id, string name, string description, IEnumerable<TemplateFieldRequest> fields)
    {
        var idx = _templates.FindIndex(t => t.Id == id);
        if (idx < 0) return null;
        var templateFields = fields.Select((field, index) =>
            new TemplateField(index + 1, field.Name, field.Type, field.Order ?? index + 1, field.RelevantForProgress ?? true))
            .OrderBy(f => f.Order).ToArray();
        var updated = _templates[idx] with { Name = name, Description = description, Fields = templateFields };
        _templates[idx] = updated;
        Persist();
        return updated;
    }

    public void DeleteTemplate(int id) { _templates.RemoveAll(t => t.Id == id); Persist(); }

    public AuditRoom? UpdateRoom(int id, string name, string description, string capacity, string area, string notes, string fieldsJson = "{}")
    {
        var idx = _rooms.FindIndex(r => r.Id == id);
        if (idx < 0) return null;
        var updated = _rooms[idx] with { Name = name, Description = description, Capacity = capacity, Area = area, Notes = notes, FieldsJson = fieldsJson };
        _rooms[idx] = updated;
        Persist();
        return updated;
    }

    public void DeleteRoom(int id) { _rooms.RemoveAll(r => r.Id == id); Persist(); }

    private readonly List<string> _inMemoryLog = new();

    public void AddLog(string level, string category, string message)
    {
        // in-memory log (also written to file via AuditLogger DI)
        _inMemoryLog.Insert(0, $"[{DateTime.UtcNow:HH:mm:ss}] [{level}] [{category}] {message}");
        if (_inMemoryLog.Count > 200) _inMemoryLog.RemoveAt(_inMemoryLog.Count - 1);
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

    private static List<AuditInstance> CreateInitialAudits() => new();

    private static List<AuditChecklistEntry> CreateInitialChecklistEntries() => new();
}

public sealed class BackupStore
{
    private readonly string _folderPath;
    private readonly string _uploadDirectory;
    private readonly string _documentsDirectory;
    private readonly string _storageDirectory;
    private readonly AppDatabase _appDatabase;
    private readonly UserStore _userStore;
    private readonly AuditStore _auditStore;
    private const int DEFAULT_MAX_BACKUPS = 10;

    public BackupStore(string folderPath, string uploadDirectory, string documentsDirectory, string storageDirectory, AppDatabase appDatabase, UserStore userStore, AuditStore auditStore)
    {
        _folderPath = folderPath;
        _uploadDirectory = uploadDirectory;
        _documentsDirectory = documentsDirectory;
        _storageDirectory = storageDirectory;
        _appDatabase = appDatabase;
        _userStore = userStore;
        _auditStore = auditStore;
        Directory.CreateDirectory(_folderPath);
    }

    public IReadOnlyList<BackupRecord> List()
    {
        return Directory.GetFiles(_folderPath, "*.zip")
            .Select(filePath =>
            {
                var fileInfo = new FileInfo(filePath);
                return new BackupRecord(
                    Path.GetFileNameWithoutExtension(fileInfo.Name),
                    fileInfo.Name,
                    fileInfo.LastWriteTimeUtc,
                    fileInfo.Length,
                    fileInfo.Name.StartsWith("upload_", StringComparison.OrdinalIgnoreCase) ? "Hochgeladen" : "Vollbackup");
            })
            .OrderByDescending(record => record.CreatedAtUtc)
            .ToList();
    }

    // Produces a comprehensive, restorable backup: the raw SQLite database file (jede Liste der App inkl.
    // Kategorien/Standorte/Räume/Audits/Dokumente/PDF-Designs/Checklisten/Benutzer/Backup-Zeitplan), die
    // Logs, sowie die uploads- und documents-Verzeichnisse - alles technisch 1:1 restaurierbar. Zusätzlich
    // wird unter "Lesbare-Struktur/" eine für Menschen nachvollziehbare Ordnerhierarchie
    // (Kategorie/Standort/Grunddaten|Raeume|Dokumente, Bilder als echte Dateien) abgelegt, rein zur
    // Durchsicht - diese wird beim Wiederherstellen nicht benötigt und auch nicht gelesen.
    public BackupRecord Create(AuditStore store)
    {
        var fileName = $"backup_{DateTime.UtcNow:yyyyMMdd_HHmmss}.zip";
        var fullPath = Path.Combine(_folderPath, fileName);

        using (var archiveStream = File.Create(fullPath))
        using (var archive = new ZipArchive(archiveStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var manifest = new
            {
                generatedUtc = DateTime.UtcNow,
                kategorien = store.Categories.Select(c => c.Name),
                standorte = store.Sites.Select(s => s.Name),
                anzahlRaeume = store.Rooms.Count,
                anzahlAudits = store.Audits.Count,
                anzahlDokumente = store.Documents.Count,
                anzahlBenutzer = _userStore.All.Count(),
                hinweis = "Benutzerpasswörter liegen in der Datenbank ausschließlich als Einweg-Hash (PBKDF2) vor, niemals im Klartext."
            };

            var manifestEntry = archive.CreateEntry("manifest.json");
            using (var manifestStream = new StreamWriter(manifestEntry.Open(), Encoding.UTF8))
            {
                manifestStream.Write(JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }));
            }

            if (File.Exists(_appDatabase.DatabasePath))
            {
                archive.CreateEntryFromFile(_appDatabase.DatabasePath, "database/audit-tool.db");
            }

            AddDirectoryToArchive(archive, _uploadDirectory, "uploads");
            AddDirectoryToArchive(archive, _documentsDirectory, "documents");
            AddLogsToArchive(archive);
            AddHumanReadableStructure(archive, store);
        }

        var info = new FileInfo(fullPath);
        ApplyBackupRotation(DEFAULT_MAX_BACKUPS);
        return new BackupRecord(Path.GetFileNameWithoutExtension(info.Name), info.Name, info.LastWriteTimeUtc, info.Length, "Vollbackup");
    }

    private void AddLogsToArchive(ZipArchive archive)
    {
        foreach (var logFileName in new[] { "audit_logs.jsonl", "error_logs.jsonl" })
        {
            var logFilePath = Path.Combine(_storageDirectory, logFileName);
            if (File.Exists(logFilePath))
            {
                archive.CreateEntryFromFile(logFilePath, $"logs/{logFileName}");
            }
        }
    }

    // Public: auch vom Admin-Datenexport-Endpunkt (/api/admin/export/zip) genutzt, um Raumbilder in echte
    // Dateien je Raumordner aufzuteilen, statt sie als Base64 in einer JSON-Datei zu belassen.
    public static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(name.Select(c => invalid.Contains(c) ? '_' : c).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "Unbenannt" : cleaned;
    }

    // Zerlegt ein Feld-JSON (fieldsJson/groundDataJson) in Text-Werte (-> Textdatei) und Bild-Werte
    // (Base64-Data-URLs, mit "||" getrennt für Mehrfachbilder) -> echte, einzeln öffenbare Bilddateien.
    private static void WriteFieldDataToArchive(ZipArchive archive, string folderPath, string fieldsJson)
    {
        Dictionary<string, string>? fields;
        try
        {
            fields = JsonSerializer.Deserialize<Dictionary<string, string>>(fieldsJson);
        }
        catch
        {
            fields = null;
        }
        if (fields is null || fields.Count == 0) return;

        var textLines = new List<string>();
        foreach (var (key, value) in fields)
        {
            if (string.IsNullOrWhiteSpace(value)) continue;
            if (value.Contains("data:image", StringComparison.OrdinalIgnoreCase))
            {
                var images = value.Split("||", StringSplitOptions.RemoveEmptyEntries);
                for (var i = 0; i < images.Length; i++)
                {
                    WriteDataUrlImage(archive, folderPath, SanitizeFileName(key), i, images[i]);
                }
            }
            else
            {
                textLines.Add($"{key}: {value}");
            }
        }

        if (textLines.Count > 0)
        {
            var entry = archive.CreateEntry($"{folderPath}/Daten.txt");
            using var stream = new StreamWriter(entry.Open(), Encoding.UTF8);
            stream.Write(string.Join(Environment.NewLine, textLines));
        }
    }

    public static void WriteDataUrlImage(ZipArchive archive, string folderPath, string fieldName, int index, string dataUrl)
    {
        var commaIndex = dataUrl.IndexOf(',');
        if (commaIndex < 0) return;
        var header = dataUrl[..commaIndex];
        var payload = dataUrl[(commaIndex + 1)..];
        var extension = header.Contains("png", StringComparison.OrdinalIgnoreCase) ? "png"
            : header.Contains("webp", StringComparison.OrdinalIgnoreCase) ? "webp"
            : header.Contains("gif", StringComparison.OrdinalIgnoreCase) ? "gif"
            : "jpg";

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(payload);
        }
        catch
        {
            return;
        }

        var suffix = index > 0 ? $"_{index + 1}" : "";
        var entry = archive.CreateEntry($"{folderPath}/{fieldName}{suffix}.{extension}");
        using var entryStream = entry.Open();
        entryStream.Write(bytes, 0, bytes.Length);
    }

    private static string ResolveFolderPath(AuditStore store, int folderId)
    {
        var segments = new List<string>();
        var currentId = folderId;
        var guard = 0;
        while (currentId > 0 && guard++ < 50)
        {
            var folder = store.Folders.FirstOrDefault(f => f.Id == currentId);
            if (folder is null) break;
            segments.Insert(0, SanitizeFileName(folder.Name));
            currentId = folder.ParentFolderId;
        }
        return string.Join("/", segments);
    }

    private void AddHumanReadableStructure(ZipArchive archive, AuditStore store)
    {
        const string root = "Lesbare-Struktur";
        foreach (var category in store.Categories)
        {
            var categoryFolder = SanitizeFileName(category.Name);
            foreach (var site in store.Sites.Where(s => s.CategoryId == category.Id))
            {
                var basePath = $"{root}/{categoryFolder}/{SanitizeFileName(site.Name)}";

                // Grunddaten: aktueller (Live-)Stand sowie der zum jeweiligen Audit eingefrorene Stand.
                WriteFieldDataToArchive(archive, $"{basePath}/Grunddaten/Aktuell (live)", site.GroundDataJson);
                foreach (var audit in store.Audits.Where(a => a.SiteId == site.Id))
                {
                    var auditLabel = SanitizeFileName($"{audit.Title} ({audit.CreatedAtUtc:yyyy-MM-dd})");
                    WriteFieldDataToArchive(archive, $"{basePath}/Grunddaten/{auditLabel}", audit.GroundDataJson);
                }

                // Räume/Objekte: Live-Stand plus jeder je Audit eingefrorene Snapshot, gruppiert nach Raumname.
                foreach (var room in store.Rooms.Where(r => r.SiteId == site.Id))
                {
                    var versionLabel = room.AuditId == 0
                        ? "Aktuell (live)"
                        : SanitizeFileName(store.Audits.FirstOrDefault(a => a.Id == room.AuditId)?.Title ?? $"Audit {room.AuditId}");
                    WriteFieldDataToArchive(archive, $"{basePath}/Raeume/{SanitizeFileName(room.Name)}/{versionLabel}", room.FieldsJson);
                }

                // Dokumente: echte Dateien (generierte PDFs + hochgeladene Fremddokumente), inkl. Archiv und Unterordner.
                foreach (var document in store.Documents.Where(d => d.SiteId == site.Id))
                {
                    var sourcePath = Path.Combine(_documentsDirectory, document.FileName.Replace('/', Path.DirectorySeparatorChar));
                    if (!File.Exists(sourcePath)) continue;

                    var pathSegments = new List<string> { $"{basePath}/Dokumente" };
                    if (document.IsArchived) pathSegments.Add("Archiv");
                    var folderPath = document.FolderId > 0 ? ResolveFolderPath(store, document.FolderId) : "";
                    if (!string.IsNullOrEmpty(folderPath)) pathSegments.Add(folderPath);

                    var extension = Path.GetExtension(sourcePath);
                    archive.CreateEntryFromFile(sourcePath, $"{string.Join("/", pathSegments)}/{SanitizeFileName(document.Title)}{extension}");
                }
            }
        }
    }

    private static void AddDirectoryToArchive(ZipArchive archive, string sourceDirectory, string entryPrefix)
    {
        if (!Directory.Exists(sourceDirectory)) return;
        foreach (var filePath in Directory.GetFiles(sourceDirectory, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sourceDirectory, filePath).Replace('\\', '/');
            archive.CreateEntryFromFile(filePath, $"{entryPrefix}/{relative}");
        }
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

    // Overwrites the live database file and the uploads/documents directories with the contents of the
    // backup, then reloads every in-memory store from the restored database so changes take effect
    // immediately without needing a manual application restart.
    public bool Restore(string backupId, AuditStore store)
    {
        var filePath = GetFilePath(backupId);
        if (filePath is null)
        {
            return false;
        }

        using var archive = ZipFile.OpenRead(filePath);
        // Supports both this store's own backup layout ("database/audit-tool.db" + uploads/documents trees)
        // and the simpler scheduled-backup layout written by BackupService ("audit-tool.db" at the zip root).
        var databaseEntry = archive.GetEntry("database/audit-tool.db") ?? archive.GetEntry("audit-tool.db");
        if (databaseEntry is null)
        {
            // Not a restorable backup (e.g. a legacy manifest-only export) - nothing we can safely restore.
            return false;
        }

        var databaseDirectory = Path.GetDirectoryName(_appDatabase.DatabasePath);
        if (!string.IsNullOrWhiteSpace(databaseDirectory))
        {
            Directory.CreateDirectory(databaseDirectory);
        }

        databaseEntry.ExtractToFile(_appDatabase.DatabasePath, overwrite: true);

        RestoreDirectoryFromArchive(archive, "uploads/", _uploadDirectory);
        RestoreDirectoryFromArchive(archive, "documents/", _documentsDirectory);
        RestoreLogsFromArchive(archive);

        store.ReloadFromDatabase();
        _userStore.ReloadFromDatabase();

        return true;
    }

    private void RestoreLogsFromArchive(ZipArchive archive)
    {
        foreach (var logFileName in new[] { "audit_logs.jsonl", "error_logs.jsonl" })
        {
            var entry = archive.GetEntry($"logs/{logFileName}");
            if (entry is not null)
            {
                entry.ExtractToFile(Path.Combine(_storageDirectory, logFileName), overwrite: true);
            }
        }
    }

    private static void RestoreDirectoryFromArchive(ZipArchive archive, string entryPrefix, string targetDirectory)
    {
        var entries = archive.Entries.Where(e => e.FullName.StartsWith(entryPrefix, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(e.Name)).ToList();
        if (entries.Count == 0)
        {
            // Older/scheduled backups only contain the database file - leave the current uploads/documents
            // on disk untouched instead of wiping them for data we have no replacement for.
            return;
        }

        if (Directory.Exists(targetDirectory))
        {
            Directory.Delete(targetDirectory, recursive: true);
        }
        Directory.CreateDirectory(targetDirectory);

        foreach (var entry in entries)
        {
            var relative = entry.FullName.Substring(entryPrefix.Length);
            var destination = Path.Combine(targetDirectory, relative.Replace('/', Path.DirectorySeparatorChar));
            var destinationDirectory = Path.GetDirectoryName(destination);
            if (!string.IsNullOrWhiteSpace(destinationDirectory))
            {
                Directory.CreateDirectory(destinationDirectory);
            }
            entry.ExtractToFile(destination, overwrite: true);
        }
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

    public string? GetFilePath(string backupId)
    {
        var filePath = Path.Combine(_folderPath, $"{backupId}.zip");
        if (File.Exists(filePath)) return filePath;
        filePath = Path.Combine(_folderPath, backupId);
        return File.Exists(filePath) ? filePath : null;
    }

    public async Task<BackupRecord> Upload(IFormFile file)
    {
        var fileName = $"upload_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{file.FileName}";
        var fullPath = Path.Combine(_folderPath, fileName);
        using var stream = File.Create(fullPath);
        await file.CopyToAsync(stream);
        var info = new FileInfo(fullPath);
        return new BackupRecord(Path.GetFileNameWithoutExtension(info.Name), info.Name, info.LastWriteTimeUtc, info.Length, "Hochgeladen");
    }
}
// PBKDF2-Passworthashing (reiner BCL-Code, keine zusätzliche NuGet-Abhängigkeit). Format der gespeicherten
// Zeichenkette: "PBKDF2$<Iterationen>$<Salt-Base64>$<Hash-Base64>". Damit landen im Datenbank-Backup (und
// damit im Vollbackup-ZIP) niemals Klartext-Passwörter, sondern nur Einweg-Hashes.
public static class PasswordHasher
{
    private const int SaltSize = 16;
    private const int HashSize = 32;
    private const int Iterations = 100_000;
    private const string Prefix = "PBKDF2";

    public static bool IsHashed(string stored) => stored.StartsWith(Prefix + "$", StringComparison.Ordinal);

    public static string Hash(string password)
    {
        var salt = System.Security.Cryptography.RandomNumberGenerator.GetBytes(SaltSize);
        var hash = System.Security.Cryptography.Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, System.Security.Cryptography.HashAlgorithmName.SHA256, HashSize);
        return $"{Prefix}${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string stored, string password)
    {
        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != Prefix) return false;
        if (!int.TryParse(parts[1], out var iterations)) return false;
        var salt = Convert.FromBase64String(parts[2]);
        var expectedHash = Convert.FromBase64String(parts[3]);
        var actualHash = System.Security.Cryptography.Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, System.Security.Cryptography.HashAlgorithmName.SHA256, expectedHash.Length);
        return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(expectedHash, actualHash);
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

    // Re-reads users from the (possibly just restored) database file. Used after a backup restore.
    public void ReloadFromDatabase()
    {
        var reloaded = _database.Load("app_users", CreateDefaultUsers());
        _users.Clear();
        _users.AddRange(reloaded);
    }

    // Prüft ein Passwort gegen den gespeicherten Hash. Ältere Konten (vor Einführung des Hashings) mit
    // Klartext-Passwort werden bei erfolgreichem Login transparent auf PBKDF2 migriert.
    public bool VerifyPassword(AppUser user, string password)
    {
        if (PasswordHasher.IsHashed(user.Password))
        {
            return PasswordHasher.Verify(user.Password, password);
        }

        if (!string.Equals(user.Password, password, StringComparison.Ordinal))
        {
            return false;
        }

        UpdatePassword(user.Id, password);
        return true;
    }

    public AppUser? Authenticate(string username, string password)
    {
        var user = _users.FirstOrDefault(u =>
            string.Equals(u.UserName, username, StringComparison.OrdinalIgnoreCase) && u.IsActive);

        if (user is null || !VerifyPassword(user, password))
        {
            return null;
        }

        return GetById(user.Id);
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
        var user = new AppUser(nextId, userName, PasswordHasher.Hash(password), role, displayName ?? userName);
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
            _users[index] = user with { Password = PasswordHasher.Hash(newPassword) };
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
        new AppUser(1, "superadmin", PasswordHasher.Hash("AuditTool!2026"), "Superadmin", "Superadmin"),
        new AppUser(2, "admin", PasswordHasher.Hash("AuditTool!2026"), "Admin", "Administrator"),
        new AppUser(3, "user", PasswordHasher.Hash("Password123!"), "Benutzer", "Standard Nutzer"),
        new AppUser(4, "azubi", PasswordHasher.Hash("Password123!"), "Azubi", "Auszubildender")
    };
}

public sealed record AppUser(int Id, string UserName, string Password, string Role, string DisplayName)
{
    public bool IsActive { get; init; } = true;
}

public sealed record AuditCategory(int Id, string Name, string Description);
public sealed record AuditSite(int Id, int CategoryId, string Name, string Address, string Phone, string CaretakerPhone, bool Active)
{
    public string GroundDataJson { get; init; } = "{}";
}
public sealed record AuditRoom(int Id, int SiteId, string Name, string Description, string Capacity, string Area, string Notes)
{
    public string FieldsJson { get; init; } = "{}";
    public int AuditId { get; init; } = 0;
}

public sealed record AuditObject(int Id, int RoomId, string Name, string ObjectType, string Status, string Notes);
public sealed record AuditChecklistEntry(int Id, int AuditId, int TemplateFieldId, string Question, string Answer, string Status);
public sealed record AuditInstance(int Id, int SiteId, int TemplateId, string Title, string TemplateName, string CreatedBy, DateTime CreatedAtUtc, string Status, IEnumerable<AuditChecklistEntry> ChecklistEntries)
{
    public string GroundDataJson { get; init; } = "{}";
}
public sealed record AuditInstanceSummary(int Id, int SiteId, string Title, int TemplateId, string TemplateName, string CreatedBy, DateTime CreatedAtUtc, string Status, int EntryCount);
public sealed record TemplateField(int Id, string Name, string Type, int Order, bool RelevantForProgress);
public sealed record AuditTemplate(int Id, string Name, string Description, IEnumerable<TemplateField> Fields);
public sealed record PdfDesign(int Id, string Name, string Description, string ConfigJson, DateTime CreatedAtUtc);
public sealed record ChecklistTemplate(int Id, string Name, int TemplateId, string ColumnsJson, DateTime CreatedAtUtc);
public sealed record ChecklistValue(int Id, int ChecklistTemplateId, int RoomId, string DataJson, DateTime UpdatedAtUtc);
public sealed record UserSummary(int Id, string UserName, string DisplayName, string Role, bool IsActive);
public sealed record BackupRecord(string Id, string FileName, DateTime CreatedAtUtc, long SizeBytes, string Type);
public sealed record DocumentFolder(int Id, int SiteId, int ParentFolderId, string Name, DateTime CreatedAtUtc);
public sealed record AuditDocument(int Id, int AuditId, int SiteId, string Title, int? PdfDesignId, string? PdfDesignName, string FileName, long SizeBytes, DateTime CreatedAtUtc, bool IsArchived, bool IsUploaded, int FolderId);
public sealed record LoginRequest(string Username, string Password);
public sealed record CreateUserRequest(string UserName, string Password, string Role, string DisplayName);
public sealed record ResetPasswordRequest(string NewPassword);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record CreateCategoryRequest(string Name, string Description);
public sealed record CreateSiteRequest(int CategoryId, string Name, string Address, string Phone, string CaretakerPhone);
public sealed record CreateRoomRequest(int SiteId, string Name, string Description, string? Capacity, string? Area, string? Notes)
{
    public string? FieldsJson { get; init; }
}
public sealed record CreateObjectRequest(int RoomId, string Name, string? ObjectType, string? Status, string? Notes);
public sealed record CreateAuditRequest(int SiteId, int TemplateId, string Title);
public sealed record CreateChecklistEntryRequest(string? Question, string? Answer, string? Status);
public sealed record UpdateChecklistEntryRequest(string? Answer, string? Status);
public sealed record TemplateFieldRequest(string Name, string Type, int? Order, bool? RelevantForProgress);
public sealed record CreateTemplateRequest(string Name, string Description, IEnumerable<TemplateFieldRequest>? Fields);
public sealed record UpdateSiteRequest(int CategoryId, string? Name, string? Address, string? Phone, string? CaretakerPhone)
{
    public string? GroundDataJson { get; init; }
}
public sealed record UpdateGroundDataRequest(string? GroundDataJson);
public sealed record CreatePdfDesignRequest(string Name, string? Description, string? ConfigJson);
public sealed record CreateChecklistTemplateRequest(string Name, int? TemplateId, string? ColumnsJson);
public sealed record UpsertChecklistValueRequest(int ChecklistTemplateId, int RoomId, string? DataJson);
public sealed record GenerateDocumentRequest(string Title, int? PdfDesignId, int? FolderId);
public sealed record UpdateDocumentRequest(string? Title, int? FolderId, bool? IsArchived);
public sealed record CreateFolderRequest(string Name, int? ParentFolderId);
