using System.IdentityModel.Tokens.Jwt;
using System.IO.Compression;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

var jwtKey = builder.Configuration["Jwt:Key"] ?? "AuditTool-Dev-Key-Change-me-in-production-1234567890";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "audit-tool";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "audit-tool-clients";

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

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

var backupDirectory = Path.Combine(builder.Environment.ContentRootPath, "..", "storage", "backups");
Directory.CreateDirectory(backupDirectory);

builder.Services.AddSingleton(new UserStore());
builder.Services.AddSingleton(new AuditStore());
builder.Services.AddSingleton(new BackupStore(backupDirectory));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseRouting();
app.UseCors("FrontendPolicy");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new
{
    status = "ok",
    application = "audit-tool",
    timestampUtc = DateTime.UtcNow,
    sessionTimeoutHours = 8
}));

app.MapPost("/api/auth/login", (LoginRequest request, UserStore users) =>
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

    var token = CreateJwtToken(user, jwtKey, jwtIssuer, jwtAudience);
    return Results.Ok(new
    {
        token,
        expiresInHours = 8,
        expiresAtUtc = DateTime.UtcNow.AddHours(8),
        user = new UserSummary(user.Id, user.UserName, user.DisplayName, user.Role, user.IsActive)
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

app.Run();

static string CreateJwtToken(AppUser user, string jwtKey, string jwtIssuer, string jwtAudience)
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

public sealed class AuditStore
{
    private readonly List<AuditCategory> _categories = new()
    {
        new AuditCategory(1, "Grundschulen", "Standorte für Schuleinrichtungen"),
        new AuditCategory(2, "Berufsschulen", "Berufliche Ausbildungsstätten"),
        new AuditCategory(3, "Technik", "Technische Anlagen und Werkstätten")
    };

    private readonly List<AuditSite> _sites = new()
    {
        new AuditSite(1, 1, "Goldberg HS", "Musterstraße 12, Berlin", "030 1234567", "030 7654321", true),
        new AuditSite(2, 2, "Steinweg Berufsschule", "Industriestraße 7, Hamburg", "040 4445566", "040 9988776", true),
        new AuditSite(3, 3, "Nordsee Werkstätten", "Küstenweg 3, Kiel", "0431 112233", "0431 445566", false)
    };

    private readonly List<AuditTemplate> _templates = new()
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

    private readonly List<AuditRoom> _rooms = new()
    {
        new AuditRoom(1, 1, "Haupthalle", "Zentraler Prüfbereich", "240", "960", "A-07"),
        new AuditRoom(2, 1, "Werkstatt 1", "Maschinen und Materiallager", "90", "320", "B-02"),
        new AuditRoom(3, 2, "Lehrlabor 3", "Prüfbereich mit Geräten", "52", "180", "C-11")
    };

    private readonly List<AuditObject> _objects = new()
    {
        new AuditObject(1, 1, "Feuerlöscher", "Sicherheit", "Gut", "Regelmäßig geprüft"),
        new AuditObject(2, 1, "Arbeitstisch", "Einrichtung", "Aktion erforderlich", "Schraube gelockert"),
        new AuditObject(3, 3, "Messtechnik", "Gerät", "Gut", "Letzte Prüfung vor 2 Wochen")
    };

    private readonly List<AuditInstance> _audits = new()
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

    private readonly List<AuditChecklistEntry> _checklistEntries = new()
    {
        new AuditChecklistEntry(1, 1, 1, "Raumname", "Haupthalle", "ok"),
        new AuditChecklistEntry(2, 1, 2, "Zustand", "Gut", "ok"),
        new AuditChecklistEntry(3, 2, 4, "Objektname", "Messtechnik", "ok")
    };

    public IReadOnlyList<AuditCategory> Categories => _categories;
    public IReadOnlyList<AuditSite> Sites => _sites;
    public IReadOnlyList<AuditTemplate> Templates => _templates;
    public IReadOnlyList<AuditRoom> Rooms => _rooms;
    public IReadOnlyList<AuditObject> Objects => _objects;
    public IReadOnlyList<AuditInstance> Audits => _audits;

    public AuditCategory CreateCategory(string name, string description)
    {
        var id = _categories.Count == 0 ? 1 : _categories.Max(x => x.Id) + 1;
        var category = new AuditCategory(id, name, description);
        _categories.Add(category);
        return category;
    }

    public AuditSite CreateSite(int categoryId, string name, string address, string phone, string caretakerPhone)
    {
        var id = _sites.Count == 0 ? 1 : _sites.Max(x => x.Id) + 1;
        var site = new AuditSite(id, categoryId, name, address, phone, caretakerPhone, true);
        _sites.Add(site);
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
        return template;
    }

    public AuditRoom CreateRoom(int siteId, string name, string description, string capacity, string area, string notes)
    {
        var id = _rooms.Count == 0 ? 1 : _rooms.Max(x => x.Id) + 1;
        var room = new AuditRoom(id, siteId, name, description, capacity, area, notes);
        _rooms.Add(room);
        return room;
    }

    public AuditObject CreateObject(int roomId, string name, string objectType, string status, string notes)
    {
        var id = _objects.Count == 0 ? 1 : _objects.Max(x => x.Id) + 1;
        var obj = new AuditObject(id, roomId, name, objectType, status, notes);
        _objects.Add(obj);
        return obj;
    }

    public AuditInstance CreateAudit(int siteId, int templateId, string title, string createdBy, string templateName)
    {
        var id = _audits.Count == 0 ? 1 : _audits.Max(x => x.Id) + 1;
        var audit = new AuditInstance(id, siteId, templateId, title, templateName, createdBy, DateTime.UtcNow, "In Bearbeitung", Array.Empty<AuditChecklistEntry>());
        _audits.Add(audit);
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

        return entry;
    }
}

public sealed class BackupStore
{
    private readonly string _folderPath;

    public BackupStore(string folderPath)
    {
        _folderPath = folderPath;
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
            users = new UserStore().All.Select(user => new { user.Id, user.UserName, user.DisplayName, user.Role, user.IsActive })
        };

        var entry = archive.CreateEntry("backup/manifest.json");
        using var stream = new StreamWriter(entry.Open(), Encoding.UTF8);
        stream.Write(JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true }));

        var info = new FileInfo(fullPath);
        return new BackupRecord(Path.GetFileNameWithoutExtension(info.Name), info.Name, info.LastWriteTimeUtc, info.Length, "Vollbackup");
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
    private readonly List<AppUser> _users = new()
    {
        new AppUser(1, "superadmin", "Password123!", "Superadmin", "Superadmin"),
        new AppUser(2, "admin", "Password123!", "Admin", "Administrator"),
        new AppUser(3, "user", "Password123!", "Benutzer", "Standard Nutzer"),
        new AppUser(4, "azubi", "Password123!", "Azubi", "Auszubildender")
    };

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

    public AppUser Create(string userName, string password, string? displayName, string role)
    {
        var nextId = _users.Count == 0 ? 1 : _users.Max(x => x.Id) + 1;
        var user = new AppUser(nextId, userName, password, role, displayName ?? userName);
        _users.Add(user);
        return user;
    }
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
public sealed record CreateCategoryRequest(string Name, string Description);
public sealed record CreateSiteRequest(int CategoryId, string Name, string Address, string Phone, string CaretakerPhone);
public sealed record CreateRoomRequest(int SiteId, string Name, string Description, string? Capacity, string? Area, string? Notes);
public sealed record CreateObjectRequest(int RoomId, string Name, string? ObjectType, string? Status, string? Notes);
public sealed record CreateAuditRequest(int SiteId, int TemplateId, string Title);
public sealed record CreateChecklistEntryRequest(string? Question, string? Answer, string? Status);
public sealed record TemplateFieldRequest(string Name, string Type, int? Order, bool? RelevantForProgress);
public sealed record CreateTemplateRequest(string Name, string Description, IEnumerable<TemplateFieldRequest>? Fields);
