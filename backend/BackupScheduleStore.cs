using System.Text.Json;

public class BackupScheduleStore
{
    private readonly string dbPath = Path.Combine(Directory.GetCurrentDirectory(), "storage", "audit-tool.db");
    private BackupSchedule? schedule;

    public BackupScheduleStore()
    {
        LoadSchedule();
    }

    private void LoadSchedule()
    {
        if (!File.Exists(dbPath))
        {
            schedule = new BackupSchedule { Id = 1, Enabled = false, Time = new TimeOnly(2, 0), Days = Array.Empty<DayOfWeek>(), MaxBackups = 10 };
            return;
        }

        try
        {
            var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={dbPath}");
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = "SELECT value FROM app_state WHERE key = 'backup_schedule'";

            using var reader = command.ExecuteReader();
            if (reader.Read())
            {
                var json = reader.GetString(0);
                schedule = JsonSerializer.Deserialize<BackupSchedule>(json);
            }
            else
            {
                schedule = new BackupSchedule { Id = 1, Enabled = false, Time = new TimeOnly(2, 0), Days = Array.Empty<DayOfWeek>(), MaxBackups = 10 };
            }

            connection.Close();
        }
        catch
        {
            schedule = new BackupSchedule { Id = 1, Enabled = false, Time = new TimeOnly(2, 0), Days = Array.Empty<DayOfWeek>(), MaxBackups = 10 };
        }
    }

    public BackupSchedule? GetSchedule()
    {
        return schedule;
    }

    public void UpdateSchedule(BackupSchedule newSchedule)
    {
        schedule = newSchedule;
        schedule.UpdatedAtUtc = DateTime.UtcNow;

        try
        {
            var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={dbPath}");
            connection.Open();

            var command = connection.CreateCommand();
            command.CommandText = "INSERT OR REPLACE INTO app_state (key, value) VALUES ('backup_schedule', @value)";
            command.Parameters.AddWithValue("@value", JsonSerializer.Serialize(schedule));
            command.ExecuteNonQuery();

            connection.Close();
        }
        catch
        {
            // Silent fail
        }
    }
}
