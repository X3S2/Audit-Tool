using System.Text.Json.Serialization;

public class BackupSchedule
{
    public int Id { get; set; }
    public bool Enabled { get; set; }
    public TimeOnly Time { get; set; }
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public DayOfWeek[] Days { get; set; } = Array.Empty<DayOfWeek>();
    public int MaxBackups { get; set; } = 10;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
