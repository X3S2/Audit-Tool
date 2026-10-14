// fix010 Schritt 5: Baut automatische Backups nicht mehr selbst im falschen Verzeichnis (Directory.
// GetCurrentDirectory()/storage = /app/storage im Container, während die echten Daten im gemounteten
// Docker-Volume unter ContentRootPath/../storage liegen) und auch nicht mehr nur mit der rohen .db-Datei.
// Nutzt stattdessen über DI denselben BackupStore wie der manuelle "Backup jetzt erstellen"-Button
// (Vollbackup inkl. uploads/documents/media/logs), nur mit dem Dateinamen-Präfix "auto_" statt "backup_".
public class BackupService : BackgroundService
{
    private readonly IServiceScopeFactory _serviceScopeFactory;
    private readonly ILogger<BackupService> _logger;
    private const int CheckIntervalSeconds = 60;
    // Toleranzfenster um die geplante Uhrzeit herum, in dem ein Backup noch als "fällig" gilt - deckt
    // sowohl leichte Jitter des 60s-Prüfintervalls als auch kurze Verzögerungen durch einen laufenden
    // vorherigen Backup-Vorgang ab, ohne bei einem einmal verpassten Fenster den ganzen Tag zu warten.
    private const double ToleranceMinutes = 2.0;

    public static readonly IReadOnlyDictionary<DayOfWeek, string> GermanDayNames = new Dictionary<DayOfWeek, string>
    {
        { DayOfWeek.Monday, "Montag" },
        { DayOfWeek.Tuesday, "Dienstag" },
        { DayOfWeek.Wednesday, "Mittwoch" },
        { DayOfWeek.Thursday, "Donnerstag" },
        { DayOfWeek.Friday, "Freitag" },
        { DayOfWeek.Saturday, "Samstag" },
        { DayOfWeek.Sunday, "Sonntag" }
    };

    public BackupService(IServiceScopeFactory serviceScopeFactory, ILogger<BackupService> logger)
    {
        _serviceScopeFactory = serviceScopeFactory;
        _logger = logger;
    }

    // fix010 Schritt 5c: Europe/Berlin statt der Container-UTC-Zeit auswerten. Der Windows-Zeitzonenname
    // ("W. Europe Standard Time") dient als Fallback, falls das Image einmal ohne IANA-Zeitzonendaten
    // läuft; schlagen beide fehl, wird auf die lokale (dann vermutlich UTC) Zeit zurückgefallen, statt den
    // Dienst komplett abstürzen zu lassen.
    public static TimeZoneInfo ResolveBerlinTimeZone(ILogger? logger = null)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");
        }
        catch (TimeZoneNotFoundException)
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("W. Europe Standard Time");
            }
            catch (Exception ex)
            {
                logger?.LogWarning(ex, "Zeitzone 'Europe/Berlin' konnte nicht ermittelt werden - verwende lokale Zeit.");
                return TimeZoneInfo.Local;
            }
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("BackupService started");
        var berlinTimeZone = ResolveBerlinTimeZone(_logger);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using (var scope = _serviceScopeFactory.CreateScope())
                {
                    var scheduleStore = scope.ServiceProvider.GetRequiredService<BackupScheduleStore>();
                    var schedule = scheduleStore.GetSchedule();
                    var nowBerlin = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, berlinTimeZone);

                    if (schedule.Enabled && ShouldRunBackup(schedule, nowBerlin))
                    {
                        _logger.LogInformation("Führe geplantes automatisches Backup aus ({Time} Berliner Zeit)", nowBerlin);
                        var backupStore = scope.ServiceProvider.GetRequiredService<BackupStore>();
                        var auditStore = scope.ServiceProvider.GetRequiredService<AuditStore>();

                        backupStore.Create(auditStore, isAutomatic: true);
                        scheduleStore.UpdateLastRun(DateTime.UtcNow);
                        backupStore.ApplyBackupRotation(schedule.MaxBackups);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Fehler im BackupService");
            }

            await Task.Delay(TimeSpan.FromSeconds(CheckIntervalSeconds), stoppingToken);
        }

        _logger.LogInformation("BackupService stopped");
    }

    // fix010 Schritt 5c: Robust gegenüber Mitternacht (Differenz wird auf max. 12h "gewickelt" statt
    // naiv absolut berechnet) und übersteht einen Container-Neustart, da "zuletzt gelaufen" aus der
    // Datenbank (schedule.LastRunUtc) statt nur aus einem In-Memory-Feld gelesen wird.
    public static bool ShouldRunBackup(BackupSchedule schedule, DateTime nowBerlin)
    {
        if (schedule.Days is null || schedule.Days.Length == 0)
        {
            return false;
        }

        if (schedule.LastRunUtc.HasValue && IsSameBerlinDay(schedule.LastRunUtc.Value, nowBerlin))
        {
            return false;
        }

        var scheduleTimeSpan = schedule.Time.ToTimeSpan();
        var currentTimeSpan = nowBerlin.TimeOfDay;
        var rawDiffMinutes = Math.Abs((currentTimeSpan - scheduleTimeSpan).TotalMinutes);
        var diffMinutes = Math.Min(rawDiffMinutes, 1440 - rawDiffMinutes);
        if (diffMinutes > ToleranceMinutes)
        {
            return false;
        }

        var germanDay = GermanDayNames[nowBerlin.DayOfWeek];
        return schedule.Days.Contains(germanDay);
    }

    private static bool IsSameBerlinDay(DateTime lastRunUtc, DateTime nowBerlin)
    {
        var berlinTimeZone = ResolveBerlinTimeZone();
        var lastRunBerlin = TimeZoneInfo.ConvertTimeFromUtc(lastRunUtc, berlinTimeZone);
        return lastRunBerlin.Date == nowBerlin.Date;
    }

    // fix010 Schritt 5f: Für die Anzeige "nächste geplante Ausführung" im Admin-UI - sucht die nächste
    // Kombination aus aktiviertem Wochentag und Uhrzeit ab jetzt (Berliner Zeit), maximal eine Woche voraus.
    // Liefert null, wenn der Zeitplan deaktiviert ist oder keine Wochentage ausgewählt sind.
    public static DateTime? ComputeNextRun(BackupSchedule schedule, DateTime nowBerlin)
    {
        if (!schedule.Enabled || schedule.Days is null || schedule.Days.Length == 0)
        {
            return null;
        }

        for (var offset = 0; offset <= 7; offset++)
        {
            var candidateDate = nowBerlin.Date.AddDays(offset);
            var germanDay = GermanDayNames[candidateDate.DayOfWeek];
            if (!schedule.Days.Contains(germanDay))
            {
                continue;
            }

            var candidate = candidateDate.Add(schedule.Time.ToTimeSpan());
            if (candidate <= nowBerlin)
            {
                continue;
            }

            if (offset == 0 && schedule.LastRunUtc.HasValue && IsSameBerlinDay(schedule.LastRunUtc.Value, nowBerlin))
            {
                continue;
            }

            return candidate;
        }

        return null;
    }
}
