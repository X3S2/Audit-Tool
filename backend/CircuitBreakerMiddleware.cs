using System.Collections.Concurrent;

public class CircuitBreakerMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<CircuitBreakerMiddleware> _logger;
    private static readonly ConcurrentDictionary<string, CircuitBreakerState> States = new();

    public CircuitBreakerMiddleware(RequestDelegate next, ILogger<CircuitBreakerMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var endpoint = $"{context.Request.Method} {context.Request.Path}";
        var state = States.GetOrAdd(endpoint, _ => new CircuitBreakerState());

        if (state.Status == CircuitBreakerStatus.Open)
        {
            if (DateTime.UtcNow > state.OpenedAt!.Value.AddSeconds(30))
            {
                state.Status = CircuitBreakerStatus.HalfOpen;
                _logger.LogInformation($"Circuit breaker transitioned to Half-Open for {endpoint}");
            }
            else
            {
                context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                await context.Response.WriteAsJsonAsync(new
                {
                    message = "Dienst temporär nicht verfügbar. Bitte versuchen Sie es später erneut.",
                    retryAfter = 30
                });
                return;
            }
        }

        var originalBodyStream = context.Response.Body;
        try
        {
            using (var bufferedStream = new MemoryStream())
            {
                context.Response.Body = bufferedStream;

                await _next(context);

                if (context.Response.StatusCode < 500)
                {
                    state.RecordSuccess();
                }
                else
                {
                    state.RecordFailure();
                    if (state.FailureCount >= 5)
                    {
                        state.Status = CircuitBreakerStatus.Open;
                        state.OpenedAt = DateTime.UtcNow;
                        _logger.LogWarning($"Circuit breaker opened for {endpoint} (failures: {state.FailureCount})");
                    }
                }

                bufferedStream.Position = 0;
                await bufferedStream.CopyToAsync(originalBodyStream);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error in CircuitBreakerMiddleware for {endpoint}");
            state.RecordFailure();
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { message = "Ein Fehler ist aufgetreten." });
        }
        finally
        {
            context.Response.Body = originalBodyStream;
        }
    }
}

public enum CircuitBreakerStatus
{
    Closed,
    Open,
    HalfOpen
}

public class CircuitBreakerState
{
    public CircuitBreakerStatus Status { get; set; } = CircuitBreakerStatus.Closed;
    public int FailureCount { get; set; } = 0;
    public DateTime? OpenedAt { get; set; }

    public void RecordSuccess()
    {
        FailureCount = 0;
        if (Status == CircuitBreakerStatus.HalfOpen)
            Status = CircuitBreakerStatus.Closed;
    }

    public void RecordFailure()
    {
        FailureCount++;
    }
}
