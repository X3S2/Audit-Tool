// fix010 Schritt 5a: Nutzt jetzt denselben AppDatabase-Zugriffsweg (Tabelle app_state, Spalte "payload")
// wie alle anderen Collections, statt einer eigenen, falsch benannten Spalte ("value" existiert dort gar
// nicht) in einer separaten Verbindung. Fehler werden geloggt statt stillschweigend verschluckt;
// UpdateSchedule wirft bei einem Speicherfehler eine Exception, damit der aufrufende Endpunkt dem Frontend
// einen echten Fehler statt eines scheinbaren Erfolgs meldet.
public class BackupScheduleStore
{
    private readonly AppDatabase _database;
    private readonly ILogger<BackupScheduleStore> _logger;
    // fix010 Schritt 4a: Schützt die Zeitplan-Instanz vor gleichzeitigem Lesen (BackupService prüft jede
    // Minute) und Schreiben (Admin speichert Änderungen / BackupService aktualisiert LastRunUtc).
    private readonly object _lock = new();
    private BackupSchedule _schedule;

    public BackupScheduleStore(AppDatabase database, ILogger<BackupScheduleStore> logger)
    {
        _database = database;
        _logger = logger;
        _schedule = LoadSchedule();
    }

    private BackupSchedule LoadSchedule()
    {
        try
        {
            return _database.Load("backup_schedule", CreateDefaultSchedule());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Backup-Zeitplan konnte nicht geladen werden - verwende Standardwerte.");
            return CreateDefaultSchedule();
        }
    }

    private static BackupSchedule CreateDefaultSchedule() =>
        new() { Id = 1, Enabled = false, Time = new TimeOnly(2, 0), Days = Array.Empty<string>(), MaxBackups = 10 };

    public BackupSchedule GetSchedule()
    {
        lock (_lock)
        {
            return _schedule;
        }
    }

    public void UpdateSchedule(BackupSchedule newSchedule)
    {
        lock (_lock)
        {
            newSchedule.UpdatedAtUtc = DateTime.UtcNow;
            // LastRunUtc wird ausschließlich vom BackupService gepflegt (siehe UpdateLastRun) - ein vom
            // Frontend übermittelter Zeitplan darf diesen Wert nicht überschreiben.
            newSchedule.LastRunUtc = _schedule.LastRunUtc;

            try
            {
                _database.Save("backup_schedule", newSchedule);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Backup-Zeitplan konnte nicht gespeichert werden.");
                throw;
            }

            _schedule = newSchedule;
        }
    }

    // Wird vom BackupService direkt nach einem tatsächlich ausgeführten automatischen Backup aufgerufen.
    public void UpdateLastRun(DateTime utcTimestamp)
    {
        lock (_lock)
        {
            _schedule.LastRunUtc = utcTimestamp;
            try
            {
                _database.Save("backup_schedule", _schedule);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Zeitpunkt des letzten automatischen Backups konnte nicht gespeichert werden.");
            }
        }
    }
}
