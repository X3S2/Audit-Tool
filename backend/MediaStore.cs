using System.Security.Cryptography;
using System.Text.RegularExpressions;

// Zentrale Verwaltung ausgelagerter Bilddateien (storage/media). Vorher lagen Fotos als
// "data:image/...;base64,..."-Data-URLs direkt in den JSON-Feldern (FieldsJson/GroundDataJson/
// ConfigJson/DataJson), wurden dadurch bei jedem GET komplett mitgeliefert und bei jedem Audit-
// Schnappschuss dupliziert (Hauptursache für ~75 MB Seitenaufbau bei nur 4 Audits). Neue Fotos
// werden stattdessen als eigene Datei unter storage/media/{guid}.jpg gespeichert, Feldwerte
// enthalten nur noch die URL "/api/media/{guid}.jpg". Beide Formen (alte Data-URL UND neue
// Medien-URL) werden von ResolveImageBytes weiterhin gelesen, damit auch ältere Backups (mit noch
// eingebetteten Base64-Bildern) jederzeit korrekt wiederhergestellt und angezeigt werden können.
public static class MediaStore
{
    // Dateinamen sind entweder "{32 Hex-Zeichen}.{ext}" (Hauptbild) oder "{32 Hex-Zeichen}.thumb.{ext}"
    // (Thumbnail). Strikt geprüft, um Path-Traversal/beliebigen Dateizugriff über den Namen zu verhindern.
    private static readonly Regex MediaNameRegex = new(@"^[a-f0-9]{32}(\.thumb)?\.(jpg|jpeg|png|webp)$", RegexOptions.Compiled);

    // Erkennt eine eingebettete Base64-Data-URL irgendwo im JSON-Text (auch über mehrere, mit "||"
    // getrennte Bilder hinweg) und zerlegt sie in Mime-Typ + reinen Base64-Anteil.
    private static readonly Regex DataUrlRegex = new(@"data:image/(jpeg|jpg|png|gif|webp);base64,([A-Za-z0-9+/=]+)", RegexOptions.Compiled);

    private static string _mediaDirectory = "";

    public static string MediaDirectory => _mediaDirectory;

    public static void Initialize(string mediaDirectory)
    {
        _mediaDirectory = mediaDirectory;
        Directory.CreateDirectory(_mediaDirectory);
    }

    public static bool IsValidMediaName(string name) => MediaNameRegex.IsMatch(name);

    public static string ContentTypeFor(string name)
    {
        var ext = name.Contains(".thumb.", StringComparison.OrdinalIgnoreCase)
            ? name[(name.LastIndexOf(".thumb.", StringComparison.OrdinalIgnoreCase) + 7)..]
            : Path.GetExtension(name).TrimStart('.');

        return ext.ToLowerInvariant() switch
        {
            "png" => "image/png",
            "webp" => "image/webp",
            "gif" => "image/gif",
            _ => "image/jpeg"
        };
    }

    // Speichert hochgeladene Bildbytes unter einem frischen, zufälligen Dateinamen (keine inhaltsbasierte
    // Benennung bei Live-Uploads - einfacher und kollisionsfrei) und liefert die öffentliche Medien-URL.
    public static string SaveUploadedBytes(byte[] bytes, string extension, bool isThumb = false)
    {
        var guid = Guid.NewGuid().ToString("N");
        var name = isThumb ? $"{guid}.thumb.{extension}" : $"{guid}.{extension}";
        File.WriteAllBytes(Path.Combine(_mediaDirectory, name), bytes);
        return $"/api/media/{name}";
    }

    // Speichert Haupt- und optionales Thumbnail-Bild unter derselben GUID ({guid}.{ext} / {guid}.thumb.jpg),
    // damit beide Dateien als zusammengehörig erkennbar sind und gemeinsam gelöscht/aufgeräumt werden können.
    public static (string Url, string? ThumbUrl) SaveUploadedPair(byte[] bytes, string extension, byte[]? thumbBytes)
    {
        var guid = Guid.NewGuid().ToString("N");
        var name = $"{guid}.{extension}";
        File.WriteAllBytes(Path.Combine(_mediaDirectory, name), bytes);
        var url = $"/api/media/{name}";

        string? thumbUrl = null;
        if (thumbBytes is not null && thumbBytes.Length > 0)
        {
            var thumbName = $"{guid}.thumb.jpg";
            File.WriteAllBytes(Path.Combine(_mediaDirectory, thumbName), thumbBytes);
            thumbUrl = $"/api/media/{thumbName}";
        }

        return (url, thumbUrl);
    }

    public static bool IsMediaUrl(string value) => value.StartsWith("/api/media/", StringComparison.OrdinalIgnoreCase);

    // Löst EINEN Feldwert (entweder eine alte "data:image/...;base64,..."-Data-URL ODER eine neue
    // "/api/media/{name}"-URL) zu rohen Bildbytes + Dateiendung auf. Gibt null zurück, wenn der Wert
    // weder noch ist oder die referenzierte Datei fehlt.
    public static (byte[] Bytes, string Extension)? ResolveImageBytes(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        if (IsMediaUrl(value))
        {
            var name = value["/api/media/".Length..];
            if (!IsValidMediaName(name)) return null;
            var path = Path.Combine(_mediaDirectory, name);
            if (!File.Exists(path)) return null;
            var ext = name.Contains(".thumb.", StringComparison.OrdinalIgnoreCase)
                ? name[(name.LastIndexOf(".thumb.", StringComparison.OrdinalIgnoreCase) + 7)..]
                : Path.GetExtension(name).TrimStart('.');
            return (File.ReadAllBytes(path), ext);
        }

        var match = DataUrlRegex.Match(value);
        if (!match.Success) return null;

        try
        {
            var mime = match.Groups[1].Value.ToLowerInvariant();
            var extension = mime == "jpg" ? "jpeg" : mime;
            var bytes = Convert.FromBase64String(match.Groups[2].Value);
            return (bytes, extension == "jpeg" ? "jpg" : extension);
        }
        catch (FormatException)
        {
            return null;
        }
    }

    public static bool LooksLikeImageValue(string? value) =>
        !string.IsNullOrWhiteSpace(value) &&
        (value.Contains("data:image", StringComparison.OrdinalIgnoreCase) || IsMediaUrl(value));

    // Durchsucht einen beliebigen JSON-String nach eingebetteten Base64-Bildern und ersetzt jedes
    // Vorkommen durch eine neu angelegte Mediendatei + deren URL. Identische Bildinhalte (z. B. derselbe
    // Raum-Schnappschuss in mehreren Audits) werden über den übergebenen "dedupe"-Cache (SHA-256 ->
    // bereits erzeugte URL) auf dieselbe Datei abgebildet, damit die Migration keine unnötigen Duplikate
    // erzeugt. Rein auf Textebene (kein JSON-Parsing nötig) - funktioniert daher unabhängig davon, ob es
    // sich um ein einfaches Feld (key -> "data:...||data:...") oder ein verschachteltes Objekt (z. B.
    // PDF-Design-ConfigJson mit Logo-Bildern) handelt. Gibt den (ggf. unveränderten) Text zurück.
    public static string MigrateEmbeddedImages(string json, Dictionary<string, string> dedupeCache, ref int migratedCount)
    {
        if (string.IsNullOrEmpty(json) || !json.Contains("data:image", StringComparison.OrdinalIgnoreCase))
        {
            return json;
        }

        // Regex.Replace-Callbacks dürfen keinen ref-Parameter der umschließenden Methode erfassen - daher
        // hier lokal zählen und das Ergebnis am Ende in den ref-Parameter zurückschreiben.
        var localMigratedCount = 0;

        var result = DataUrlRegex.Replace(json, match =>
        {
            try
            {
                var bytes = Convert.FromBase64String(match.Groups[2].Value);
                var hash = Convert.ToHexString(SHA256.HashData(bytes));
                if (dedupeCache.TryGetValue(hash, out var existingUrl))
                {
                    return existingUrl;
                }

                var mime = match.Groups[1].Value.ToLowerInvariant();
                var extension = mime == "jpg" ? "jpeg" : mime;
                extension = extension == "jpeg" ? "jpg" : extension;
                var url = SaveUploadedBytes(bytes, extension);
                dedupeCache[hash] = url;
                localMigratedCount++;
                return url;
            }
            catch (FormatException)
            {
                // Undecodable payload - leave the original text untouched rather than losing data.
                return match.Value;
            }
        });

        migratedCount += localMigratedCount;
        return result;
    }
}
