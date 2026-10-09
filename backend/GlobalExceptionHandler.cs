using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        _logger.LogError(exception, "An unhandled exception has occurred");

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;
        httpContext.Response.ContentType = "application/json";

        var response = new ErrorResponse
        {
            Message = "Ein interner Fehler ist aufgetreten.",
            StatusCode = StatusCodes.Status500InternalServerError,
            Timestamp = DateTime.UtcNow
        };

        if (exception is ArgumentException or ArgumentNullException)
        {
            httpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
            response.StatusCode = StatusCodes.Status400BadRequest;
            response.Message = exception.Message;
        }
        else if (exception is KeyNotFoundException)
        {
            httpContext.Response.StatusCode = StatusCodes.Status404NotFound;
            response.StatusCode = StatusCodes.Status404NotFound;
            response.Message = "Ressource nicht gefunden.";
        }
        else if (exception is UnauthorizedAccessException)
        {
            httpContext.Response.StatusCode = StatusCodes.Status403Forbidden;
            response.StatusCode = StatusCodes.Status403Forbidden;
            response.Message = "Zugriff verweigert.";
        }

        await httpContext.Response.WriteAsJsonAsync(response, cancellationToken);
        return true;
    }
}

public class ErrorResponse
{
    public string Message { get; set; } = string.Empty;
    public int StatusCode { get; set; }
    public DateTime Timestamp { get; set; }
    public string? TraceId { get; set; }
}
