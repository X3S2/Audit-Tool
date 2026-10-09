using System.Text.RegularExpressions;

public static class InputValidator
{
    private static readonly Regex UsernameRegex = new(@"^[a-zA-Z0-9._-]{3,32}$", RegexOptions.Compiled);
    private static readonly Regex EmailRegex = new(@"^[^\s@]+@[^\s@]+\.[^\s@]+$", RegexOptions.Compiled);
    private static readonly Regex UrlRegex = new(@"^https?://[^\s]+$", RegexOptions.Compiled);

    public static (bool isValid, string? error) ValidateUsername(string? username)
    {
        if (string.IsNullOrWhiteSpace(username))
            return (false, "Benutzername ist erforderlich.");
        
        if (username.Length < 3 || username.Length > 32)
            return (false, "Benutzername muss zwischen 3 und 32 Zeichen lang sein.");
        
        if (!UsernameRegex.IsMatch(username))
            return (false, "Benutzername darf nur Buchstaben, Zahlen, Punkte, Unterstriche und Bindestriche enthalten.");
        
        return (true, null);
    }

    public static (bool isValid, string? error) ValidatePassword(string? password)
    {
        if (string.IsNullOrWhiteSpace(password))
            return (false, "Passwort ist erforderlich.");
        
        if (password.Length < 8)
            return (false, "Passwort muss mindestens 8 Zeichen lang sein.");
        
        if (password.Length > 128)
            return (false, "Passwort darf maximal 128 Zeichen lang sein.");
        
        if (!password.Any(char.IsUpper))
            return (false, "Passwort muss mindestens einen Großbuchstaben enthalten.");
        
        if (!password.Any(char.IsLower))
            return (false, "Passwort muss mindestens einen Kleinbuchstaben enthalten.");
        
        if (!password.Any(char.IsDigit))
            return (false, "Passwort muss mindestens eine Ziffer enthalten.");
        
        return (true, null);
    }

    public static (bool isValid, string? error) ValidateName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return (false, "Name ist erforderlich.");
        
        if (name.Length > 255)
            return (false, "Name darf maximal 255 Zeichen lang sein.");
        
        if (ContainsXssPayload(name))
            return (false, "Name enthält ungültige Zeichen.");
        
        return (true, null);
    }

    public static (bool isValid, string? error) ValidateDescription(string? description)
    {
        if (description == null)
            return (true, null);
        
        if (description.Length > 5000)
            return (false, "Beschreibung darf maximal 5000 Zeichen lang sein.");
        
        if (ContainsXssPayload(description))
            return (false, "Beschreibung enthält ungültige Zeichen.");
        
        return (true, null);
    }

    public static string SanitizeInput(string? input)
    {
        if (string.IsNullOrEmpty(input))
            return string.Empty;
        
        input = System.Net.WebUtility.HtmlEncode(input);
        input = Regex.Replace(input, @"<[^>]+>", "");
        return input.Trim();
    }

    private static bool ContainsXssPayload(string input)
    {
        var xssPatterns = new[]
        {
            "<script",
            "javascript:",
            "onerror=",
            "onload=",
            "onclick=",
            "<iframe",
            "<object",
            "<embed",
            "eval(",
            "expression("
        };

        var lowerInput = input.ToLower();
        return xssPatterns.Any(pattern => lowerInput.Contains(pattern));
    }
}

public class ValidationFilter
{
    public static async Task ValidateRequestAsync(HttpContext context)
    {
        if (context.Request.Method == "POST" || context.Request.Method == "PUT")
        {
            context.Request.EnableBuffering();
            
            using var reader = new StreamReader(context.Request.Body, leaveOpen: true);
            var body = await reader.ReadToEndAsync();
            context.Request.Body.Position = 0;

            if (body.Length > 10_000_000)
            {
                context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
                await context.Response.WriteAsJsonAsync(new { message = "Anfrage ist zu groß." });
            }
        }
    }
}
