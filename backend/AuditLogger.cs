using System.Text.Json;

public class AuditLogger
{
    private readonly string _auditLogPath;
    private readonly SemaphoreSlim _semaphore = new(1, 1);

    public AuditLogger(string storagePath)
    {
        _auditLogPath = Path.Combine(storagePath, "audit_logs.jsonl");
    }

    public async Task LogActionAsync(int userId, string action, string? details = null, string? ipAddress = null)
    {
        var logEntry = new AuditLogEntry
        {
            Timestamp = DateTime.UtcNow,
            UserId = userId,
            Action = action,
            Details = details,
            IpAddress = ipAddress
        };

        await AppendLogAsync(logEntry);
    }

    public async Task LogErrorAsync(int? userId, string errorType, string message, string? stackTrace = null)
    {
        var logEntry = new ErrorLogEntry
        {
            Timestamp = DateTime.UtcNow,
            UserId = userId,
            ErrorType = errorType,
            Message = message,
            StackTrace = stackTrace
        };

        await AppendErrorLogAsync(logEntry);
    }

    private async Task AppendLogAsync(AuditLogEntry entry)
    {
        await _semaphore.WaitAsync();
        try
        {
            var json = JsonSerializer.Serialize(entry);
            await File.AppendAllTextAsync(_auditLogPath, json + Environment.NewLine);
        }
        finally
        {
            _semaphore.Release();
        }
    }

    private async Task AppendErrorLogAsync(ErrorLogEntry entry)
    {
        await _semaphore.WaitAsync();
        try
        {
            var errorLogPath = Path.Combine(Path.GetDirectoryName(_auditLogPath)!, "error_logs.jsonl");
            var json = JsonSerializer.Serialize(entry);
            await File.AppendAllTextAsync(errorLogPath, json + Environment.NewLine);
        }
        finally
        {
            _semaphore.Release();
        }
    }

    public async Task<List<AuditLogEntry>> GetLogsAsync(int? userId = null, int limit = 100)
    {
        if (!File.Exists(_auditLogPath))
            return new();

        var logs = new List<AuditLogEntry>();
        var lines = await File.ReadAllLinesAsync(_auditLogPath);

        foreach (var line in lines.TakeLast(limit))
        {
            try
            {
                var entry = JsonSerializer.Deserialize<AuditLogEntry>(line);
                if (entry != null && (userId == null || entry.UserId == userId))
                    logs.Add(entry);
            }
            catch { }
        }

        return logs;
    }
}

public class AuditLogEntry
{
    public DateTime Timestamp { get; set; }
    public int UserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string? Details { get; set; }
    public string? IpAddress { get; set; }
}

public class ErrorLogEntry
{
    public DateTime Timestamp { get; set; }
    public int? UserId { get; set; }
    public string ErrorType { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? StackTrace { get; set; }
}
