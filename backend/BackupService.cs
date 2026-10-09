using System.IO.Compression;

public class BackupService : BackgroundService
{
    private readonly IServiceScopeFactory _serviceScopeFactory;
    private readonly ILogger<BackupService> _logger;
    private DateTime _lastBackupTime = DateTime.MinValue;
    private const int CheckIntervalSeconds = 60;

    public BackupService(IServiceScopeFactory serviceScopeFactory, ILogger<BackupService> logger)
    {
        _serviceScopeFactory = serviceScopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("BackupService started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using (var scope = _serviceScopeFactory.CreateScope())
                {
                    var scheduleStore = scope.ServiceProvider.GetRequiredService<BackupScheduleStore>();
                    var schedule = scheduleStore.GetSchedule();

                    if (schedule?.Enabled == true && ShouldRunBackup(schedule))
                    {
                        _logger.LogInformation("Running scheduled backup");
                        await ExecuteBackup();
                        _lastBackupTime = DateTime.Now;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in BackupService");
            }

            await Task.Delay(TimeSpan.FromSeconds(CheckIntervalSeconds), stoppingToken);
        }

        _logger.LogInformation("BackupService stopped");
    }

    private bool ShouldRunBackup(BackupSchedule schedule)
    {
        var now = DateTime.Now;
        var scheduleTime = schedule.Time.ToTimeSpan();
        var currentTime = now.TimeOfDay;

        if (_lastBackupTime.Date == now.Date)
            return false;

        var timeDiff = Math.Abs((currentTime - scheduleTime).TotalMinutes);
        if (timeDiff > CheckIntervalSeconds)
            return false;

        if (schedule.Days == null || schedule.Days.Length == 0)
            return false;

        var dayName = now.DayOfWeek.ToString();
        var germanDayMap = new Dictionary<string, string>
        {
            { "Monday", "Montag" },
            { "Tuesday", "Dienstag" },
            { "Wednesday", "Mittwoch" },
            { "Thursday", "Donnerstag" },
            { "Friday", "Freitag" },
            { "Saturday", "Samstag" },
            { "Sunday", "Sonntag" }
        };

        var germanDay = germanDayMap[dayName];
        return schedule.Days.Contains(germanDay);
    }

    private async Task ExecuteBackup()
    {
        var storagePath = Path.Combine(Directory.GetCurrentDirectory(), "storage");
        var backupPath = Path.Combine(storagePath, "backups");

        if (!Directory.Exists(backupPath))
            Directory.CreateDirectory(backupPath);

        var timestamp = DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss");
        var backupFileName = $"audit-backup_{timestamp}.zip";
        var backupFilePath = Path.Combine(backupPath, backupFileName);

        try
        {
            if (File.Exists(Path.Combine(storagePath, "audit-tool.db")))
            {
                using (var zipArchive = ZipFile.Open(backupFilePath, ZipArchiveMode.Create))
                {
                    zipArchive.CreateEntryFromFile(
                        Path.Combine(storagePath, "audit-tool.db"),
                        "audit-tool.db"
                    );
                }

                _logger.LogInformation($"Backup created: {backupFileName}");
                await CleanupOldBackups(backupPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create backup");
        }
    }

    private async Task CleanupOldBackups(string backupPath)
    {
        using (var scope = _serviceScopeFactory.CreateScope())
        {
            var scheduleStore = scope.ServiceProvider.GetRequiredService<BackupScheduleStore>();
            var schedule = scheduleStore.GetSchedule();

            if (schedule?.MaxBackups > 0)
            {
                var backupFiles = Directory.GetFiles(backupPath, "audit-backup_*.zip")
                    .OrderByDescending(f => File.GetLastWriteTime(f))
                    .ToList();

                while (backupFiles.Count > schedule.MaxBackups)
                {
                    var oldestBackup = backupFiles.Last();
                    try
                    {
                        File.Delete(oldestBackup);
                        _logger.LogInformation($"Deleted old backup: {Path.GetFileName(oldestBackup)}");
                        backupFiles.RemoveAt(backupFiles.Count - 1);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, $"Failed to delete backup: {oldestBackup}");
                        break;
                    }
                }
            }
        }

        await Task.CompletedTask;
    }
}
