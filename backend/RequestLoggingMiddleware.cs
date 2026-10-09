using System.Security.Claims;

public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, AuditLogger auditLogger)
    {
        var startTime = DateTime.UtcNow;
        var ipAddress = context.Connection.RemoteIpAddress?.ToString();
        var method = context.Request.Method;
        var path = context.Request.Path;

        try
        {
            await _next(context);

            var duration = (DateTime.UtcNow - startTime).TotalMilliseconds;
            var statusCode = context.Response.StatusCode;

            _logger.LogInformation(
                "Request {method} {path} completed with status {statusCode} in {duration}ms",
                method, path, statusCode, duration
            );

            if (IsAuditableAction(method, path))
            {
                var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (int.TryParse(userId, out var uid))
                {
                    var action = $"{method} {path}";
                    await auditLogger.LogActionAsync(uid, action, $"Status: {statusCode}", ipAddress);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception in request {method} {path}", method, path);
            
            var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (int.TryParse(userId, out var uid))
            {
                await auditLogger.LogErrorAsync(uid, ex.GetType().Name, ex.Message, ex.StackTrace);
            }
            else
            {
                await auditLogger.LogErrorAsync(null, ex.GetType().Name, ex.Message, ex.StackTrace);
            }

            throw;
        }
    }

    private static bool IsAuditableAction(string method, PathString path)
    {
        var pathStr = path.ToString().ToLower();
        
        return (method == "POST" || method == "PUT" || method == "DELETE") &&
               !pathStr.Contains("/api/health") &&
               !pathStr.Contains("/api/auth/login") &&
               !pathStr.Contains("/api/status");
    }
}
