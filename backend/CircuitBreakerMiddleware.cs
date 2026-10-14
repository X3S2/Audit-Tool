using System.Collections.Concurrent;
using Microsoft.AspNetCore.Routing;

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
        // fix010 Schritt 3c: Als Schluessel das geroutete Pfad-TEMPLATE (z.B. "/api/rooms/{roomId}")
        // statt des konkreten Pfads verwenden - sonst waechst das Dictionary unbegrenzt, weil jede
        // einzelne Medien-/Dokument-/Raum-ID (z.B. /api/media/<guid>.jpg) einen eigenen, nie wieder
        // entfernten Eintrag erzeugen wuerde.
        var routeTemplate = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? context.Request.Path.Value ?? string.Empty;
        var endpoint = $"{context.Request.Method} {routeTemplate}";
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

        // fix010 Schritt 3c: Response NICHT mehr komplett in einen MemoryStream puffern - das hat
        // ZIP-Exporte, Backups, PDFs und Bilder vollstaendig im RAM gehalten und die Auslieferung an
        // den Client erst nach vollstaendiger Fertigstellung begonnen (kein Streaming). Der
        // Statuscode ist nach Abschluss von _next(context) bereits gesetzt, dafuer ist keine
        // Pufferung noetig.
        try
        {
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
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error in CircuitBreakerMiddleware for {endpoint}");
            state.RecordFailure();
            // Ohne Pufferung kann die Response bei einem spaet auftretenden Fehler bereits
            // (teilweise) gesendet worden sein - dann darf Status/Body nicht mehr veraendert werden.
            if (!context.Response.HasStarted)
            {
                context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                await context.Response.WriteAsJsonAsync(new { message = "Ein Fehler ist aufgetreten." });
            }
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
