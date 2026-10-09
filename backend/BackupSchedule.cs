public class BackupSchedule
{
    public int Id { get; set; }
    public bool Enabled { get; set; }
    public TimeOnly Time { get; set; }
    public string[] Days { get; set; } = Array.Empty<string>();
    public int MaxBackups { get; set; } = 10;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
