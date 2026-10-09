public class TokenRefreshRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}

public class TokenRefreshResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public int ExpiresIn { get; set; }
}

public class RefreshTokenStore
{
    private readonly string _storagePath;
    private Dictionary<string, RefreshTokenData> _tokens;

    public RefreshTokenStore(string storagePath)
    {
        _storagePath = Path.Combine(storagePath, "refresh_tokens.json");
        _tokens = new();
        LoadTokens();
    }

    private void LoadTokens()
    {
        if (File.Exists(_storagePath))
        {
            try
            {
                var json = File.ReadAllText(_storagePath);
                var tokens = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, RefreshTokenData>>(json);
                if (tokens != null)
                    _tokens = tokens;
            }
            catch
            {
                _tokens.Clear();
            }
        }
    }

    private void SaveTokens()
    {
        var json = System.Text.Json.JsonSerializer.Serialize(_tokens, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
        Directory.CreateDirectory(Path.GetDirectoryName(_storagePath)!);
        File.WriteAllText(_storagePath, json);
    }

    public string GenerateRefreshToken(int userId)
    {
        var token = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
        _tokens[token] = new RefreshTokenData
        {
            UserId = userId,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(7)
        };
        SaveTokens();
        return token;
    }

    public int? ValidateRefreshToken(string token)
    {
        if (_tokens.TryGetValue(token, out var data))
        {
            if (data.ExpiresAt > DateTime.UtcNow)
                return data.UserId;
            else
                _tokens.Remove(token);
                SaveTokens();
        }
        return null;
    }

    public void RevokeRefreshToken(string token)
    {
        if (_tokens.Remove(token))
            SaveTokens();
    }

    public void RevokeAllUserTokens(int userId)
    {
        var tokensToRemove = _tokens.Where(x => x.Value.UserId == userId).Select(x => x.Key).ToList();
        foreach (var token in tokensToRemove)
            _tokens.Remove(token);
        if (tokensToRemove.Count > 0)
            SaveTokens();
    }
}

public class RefreshTokenData
{
    public int UserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
}
