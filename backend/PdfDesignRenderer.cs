using System.Text.Json;
using iText.IO.Image;
using iText.Kernel.Colors;
using iText.Kernel.Geom;
using iText.Kernel.Pdf;
using iText.Kernel.Pdf.Canvas;
using iText.Layout;
using iText.Layout.Element;
using iText.Layout.Properties;

/// <summary>
/// Renders a PDF document from a PdfDesign's ConfigJson (as produced by the frontend PdfDesignerCanvas),
/// substituting template variables and auto-filling tables / repeating blocks with room data captured in a
/// specific audit snapshot.
/// </summary>
public static class PdfDesignRenderer
{
    private const float CanvasWidth = 596f;   // matches frontend A4_W (px ~= pt)
    private const float CanvasHeight = 842f;  // matches frontend A4_H
    private const float Margin = 36f;
    private const float HeaderBandHeight = 26f;
    private const float FooterBandHeight = 26f;

    public sealed record RoomRenderData(string Name, Dictionary<string, string> Fields);

    public sealed class DesignStyle
    {
        public float FontSize { get; set; } = 11;
        public string FontWeight { get; set; } = "normal";
        public string FontStyle { get; set; } = "normal";
        public string TextDecoration { get; set; } = "none";
        public string Align { get; set; } = "left";
        public string VerticalAlign { get; set; } = "top";
        public string Color { get; set; } = "#1a1a2e";
        public string Background { get; set; } = "transparent";
        public bool Border { get; set; }
        public string BorderColor { get; set; } = "#94a3b8";
        public float BorderRadius { get; set; }
        public float Opacity { get; set; } = 100;
    }

    public sealed class DesignElement
    {
        public string Id { get; set; } = "";
        public string Type { get; set; } = "text";
        public float X { get; set; }
        public float Y { get; set; }
        public float Width { get; set; }
        public float Height { get; set; }
        public string Content { get; set; } = "";
        public string? ImageData { get; set; }
        public List<string>? Fields { get; set; }
        public DesignStyle Style { get; set; } = new();
    }

    public sealed class PageDesign
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Orientation { get; set; } = "portrait";
        public string HeaderText { get; set; } = "";
        public string FooterText { get; set; } = "";
        public bool UseGlobalHeader { get; set; }
        public List<DesignElement> Elements { get; set; } = new();
    }

    public sealed class DesignConfig
    {
        public string GlobalHeaderText { get; set; } = "";
        public string GlobalFooterText { get; set; } = "";
        public bool ShowPrintArea { get; set; } = true;
        public List<PageDesign> Pages { get; set; } = new();
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public static DesignConfig ParseConfig(string configJson)
    {
        try
        {
            return JsonSerializer.Deserialize<DesignConfig>(configJson, JsonOptions) ?? new DesignConfig();
        }
        catch
        {
            return new DesignConfig();
        }
    }

    public static byte[] Render(
        DesignConfig config,
        Dictionary<string, string> variables,
        List<RoomRenderData> rooms,
        Dictionary<string, string> fieldTypesByName)
    {
        using var memoryStream = new MemoryStream();
        using (var writer = new PdfWriter(memoryStream))
        {
            writer.SetCloseStream(false);
            using var pdfDocument = new PdfDocument(writer);

            var pages = config.Pages.Count > 0
                ? config.Pages
                : new List<PageDesign> { new() { Name = "Seite 1" } };

            // Stores header/footer raw text (with placeholders) per generated PDF page number for the second pass.
            var headerFooterMap = new Dictionary<int, (string header, string footer)>();

            foreach (var page in pages)
            {
                RenderPage(pdfDocument, page, variables, rooms, fieldTypesByName, config, headerFooterMap);
            }

            // Second pass: stamp header/footer with correct page numbers now that the total is known.
            var totalPages = pdfDocument.GetNumberOfPages();
            for (var i = 1; i <= totalPages; i++)
            {
                var pdfPage = pdfDocument.GetPage(i);
                var pageVars = new Dictionary<string, string>(variables)
                {
                    ["{{pageNumber}}"] = i.ToString(),
                    ["{{totalPages}}"] = totalPages.ToString()
                };
                StampHeaderFooter(pdfPage, pageVars, headerFooterMap);
            }
        }

        return memoryStream.ToArray();
    }

    private static void RenderPage(
        PdfDocument pdfDocument,
        PageDesign page,
        Dictionary<string, string> variables,
        List<RoomRenderData> rooms,
        Dictionary<string, string> fieldTypesByName,
        DesignConfig config,
        Dictionary<int, (string header, string footer)> headerFooterMap)
    {
        var isLandscape = page.Orientation == "landscape";
        var pageSize = isLandscape ? new PageSize(CanvasHeight, CanvasWidth) : new PageSize(CanvasWidth, CanvasHeight);
        var pdfPage = pdfDocument.AddNewPage(pageSize);
        var pageHeight = pageSize.GetHeight();
        var pageWidth = pageSize.GetWidth();

        var headerText = page.UseGlobalHeader ? config.GlobalHeaderText : page.HeaderText;
        var footerText = page.UseGlobalHeader ? config.GlobalFooterText : page.FooterText;
        headerFooterMap[pdfDocument.GetPageNumber(pdfPage)] = (headerText ?? "", footerText ?? "");

        foreach (var element in page.Elements)
        {
            switch (element.Type)
            {
                case "table":
                    RenderTable(pdfDocument, pdfPage, page, element, variables, rooms, fieldTypesByName, pageSize, headerFooterMap);
                    break;
                case "repeat-block":
                    RenderRepeatBlock(pdfDocument, pdfPage, page, element, variables, rooms, fieldTypesByName, pageSize, headerFooterMap);
                    break;
                case "divider":
                    RenderDivider(pdfPage, element, pageHeight);
                    break;
                case "rectangle":
                    RenderRectangle(pdfPage, element, pageHeight);
                    break;
                case "image-static":
                    RenderStaticImage(pdfPage, element, pageHeight);
                    break;
                case "image-audit":
                    // Standalone image-audit elements have no room context outside a repeat-block; skip.
                    break;
                default:
                    RenderTextElement(pdfPage, element, variables, pageHeight);
                    break;
            }
        }
    }

    private static void StampHeaderFooter(PdfPage pdfPage, Dictionary<string, string> variables, Dictionary<int, (string header, string footer)> headerFooterMap)
    {
        var pageNumber = pdfPage.GetDocument().GetPageNumber(pdfPage);
        if (!headerFooterMap.TryGetValue(pageNumber, out var texts)) return;

        var pageSize = pdfPage.GetPageSize();
        var pageHeight = pageSize.GetHeight();
        var pageWidth = pageSize.GetWidth();

        if (!string.IsNullOrWhiteSpace(texts.header))
        {
            var text = Substitute(texts.header, variables);
            var rect = new Rectangle(Margin, pageHeight - Margin - HeaderBandHeight, pageWidth - Margin * 2, HeaderBandHeight);
            using var canvas = new Canvas(pdfPage, rect);
            canvas.Add(new Paragraph(text).SetFontSize(9).SetFontColor(ColorFromHex("#64748b")).SetTextAlignment(TextAlignment.CENTER));
        }

        if (!string.IsNullOrWhiteSpace(texts.footer))
        {
            var text = Substitute(texts.footer, variables);
            var rect = new Rectangle(Margin, Margin - FooterBandHeight, pageWidth - Margin * 2, FooterBandHeight);
            using var canvas = new Canvas(pdfPage, rect);
            canvas.Add(new Paragraph(text).SetFontSize(9).SetFontColor(ColorFromHex("#64748b")).SetTextAlignment(TextAlignment.CENTER));
        }
    }

    private static void RenderTextElement(PdfPage pdfPage, DesignElement element, Dictionary<string, string> variables, float pageHeight)
    {
        var text = Substitute(element.Content, variables);
        var rect = ToRect(element, pageHeight);
        using var canvas = new Canvas(pdfPage, rect);
        var paragraph = BuildStyledParagraph(text, element.Style);
        ApplyBox(canvas, element.Style, rect);
        canvas.Add(paragraph);
    }

    private static Paragraph BuildStyledParagraph(string text, DesignStyle style)
    {
        var paragraph = new Paragraph(text)
            .SetFontSize(style.FontSize)
            .SetFontColor(ColorFromHex(style.Color))
            .SetTextAlignment(style.Align switch { "center" => TextAlignment.CENTER, "right" => TextAlignment.RIGHT, _ => TextAlignment.LEFT })
            .SetVerticalAlignment(style.VerticalAlign switch { "middle" => VerticalAlignment.MIDDLE, "bottom" => VerticalAlignment.BOTTOM, _ => VerticalAlignment.TOP })
            .SetMultipliedLeading(1.15f);

        if (style.FontWeight == "bold") paragraph.SetBold();
        if (style.FontStyle == "italic") paragraph.SetItalic();
        if (style.TextDecoration == "underline") paragraph.SetUnderline();
        return paragraph;
    }

    private static void ApplyBox(Canvas canvas, DesignStyle style, Rectangle rect)
    {
        var pdfCanvas = canvas.GetPdfCanvas();
        if (style.Background != "transparent" && !string.IsNullOrWhiteSpace(style.Background))
        {
            pdfCanvas.SaveState();
            pdfCanvas.SetFillColor(ColorFromHex(style.Background));
            pdfCanvas.Rectangle(rect.GetX(), rect.GetY(), rect.GetWidth(), rect.GetHeight());
            pdfCanvas.Fill();
            pdfCanvas.RestoreState();
        }
        if (style.Border)
        {
            pdfCanvas.SaveState();
            pdfCanvas.SetStrokeColor(ColorFromHex(style.BorderColor));
            pdfCanvas.Rectangle(rect.GetX(), rect.GetY(), rect.GetWidth(), rect.GetHeight());
            pdfCanvas.Stroke();
            pdfCanvas.RestoreState();
        }
    }

    private static void RenderDivider(PdfPage pdfPage, DesignElement element, float pageHeight)
    {
        var rect = ToRect(element, pageHeight);
        var pdfCanvas = new PdfCanvas(pdfPage);
        pdfCanvas.SaveState();
        pdfCanvas.SetFillColor(ColorFromHex(string.IsNullOrWhiteSpace(element.Style.Background) || element.Style.Background == "transparent" ? "#94a3b8" : element.Style.Background));
        pdfCanvas.Rectangle(rect.GetX(), rect.GetY(), rect.GetWidth(), rect.GetHeight());
        pdfCanvas.Fill();
        pdfCanvas.RestoreState();
    }

    private static void RenderRectangle(PdfPage pdfPage, DesignElement element, float pageHeight)
    {
        var rect = ToRect(element, pageHeight);
        using var canvas = new Canvas(pdfPage, rect);
        ApplyBox(canvas, element.Style, rect);
    }

    private static void RenderStaticImage(PdfPage pdfPage, DesignElement element, float pageHeight)
    {
        if (string.IsNullOrWhiteSpace(element.ImageData)) return;
        var rect = ToRect(element, pageHeight);
        try
        {
            var bytes = DecodeDataUrl(element.ImageData);
            var image = new Image(ImageDataFactory.Create(bytes));
            image.ScaleToFit(rect.GetWidth(), rect.GetHeight());
            using var canvas = new Canvas(pdfPage, rect);
            canvas.Add(image);
        }
        catch
        {
            // Ignore undecodable image data rather than failing the whole document.
        }
    }

    private static Rectangle ToRect(DesignElement element, float pageHeight)
    {
        var y = pageHeight - element.Y - element.Height;
        return new Rectangle(element.X, y, element.Width, element.Height);
    }

    private static string ResolveFieldValue(RoomRenderData room, string fieldKey, Dictionary<string, string> siteVars)
    {
        return fieldKey switch
        {
            "roomName" => room.Name,
            "category" => siteVars.GetValueOrDefault("{{category}}", ""),
            "siteName" => siteVars.GetValueOrDefault("{{siteName}}", ""),
            _ => room.Fields.GetValueOrDefault(fieldKey, "")
        };
    }

    private static List<string> SplitImageValue(string value) =>
        (value ?? "").Split("||", StringSplitOptions.RemoveEmptyEntries).ToList();

    private static void RenderTable(
        PdfDocument pdfDocument, PdfPage startPage, PageDesign page, DesignElement element,
        Dictionary<string, string> variables, List<RoomRenderData> rooms, Dictionary<string, string> fieldTypesByName,
        PageSize pageSize, Dictionary<int, (string header, string footer)> headerFooterMap)
    {
        var fields = element.Fields ?? new List<string>();
        if (fields.Count == 0 || rooms.Count == 0)
        {
            RenderTextElement(startPage, new DesignElement { X = element.X, Y = element.Y, Width = element.Width, Height = element.Height, Content = "Keine Daten vorhanden.", Style = element.Style }, variables, pageSize.GetHeight());
            return;
        }

        var currentPage = startPage;
        var rect = ToRect(element, pageSize.GetHeight());
        var rowHeight = 20f;
        var headerHeight = 22f;
        var y = rect.GetY() + rect.GetHeight();

        void DrawHeader(Rectangle area)
        {
            var colWidth = area.GetWidth() / fields.Count;
            var pdfCanvas = new PdfCanvas(currentPage);
            pdfCanvas.SaveState();
            pdfCanvas.SetFillColor(ColorFromHex("#e2e8f0"));
            pdfCanvas.Rectangle(area.GetX(), y - headerHeight, area.GetWidth(), headerHeight);
            pdfCanvas.Fill();
            pdfCanvas.RestoreState();
            for (var i = 0; i < fields.Count; i++)
            {
                var cellRect = new Rectangle(area.GetX() + i * colWidth, y - headerHeight, colWidth, headerHeight);
                using var canvas = new Canvas(currentPage, cellRect);
                canvas.Add(new Paragraph(FieldLabel(fields[i])).SetFontSize(9).SetBold().SetTextAlignment(TextAlignment.LEFT).SetVerticalAlignment(VerticalAlignment.MIDDLE));
            }
            y -= headerHeight;
        }

        DrawHeader(rect);

        var bottomLimit = Margin + FooterBandHeight;
        foreach (var room in rooms)
        {
            if (y - rowHeight < bottomLimit)
            {
                currentPage = pdfDocument.AddNewPage(pageSize);
                headerFooterMap[pdfDocument.GetPageNumber(currentPage)] = (page.HeaderText ?? "", page.FooterText ?? "");
                y = pageSize.GetHeight() - Margin - HeaderBandHeight - 8;
                DrawHeader(new Rectangle(rect.GetX(), y, rect.GetWidth(), rect.GetHeight()));
            }

            var colWidth = rect.GetWidth() / fields.Count;
            for (var i = 0; i < fields.Count; i++)
            {
                var value = ResolveFieldValue(room, fields[i], variables);
                if (fieldTypesByName.TryGetValue(fields[i], out var fType) && fType == "image")
                {
                    var count = SplitImageValue(value).Count;
                    value = count > 0 ? $"📷 {count} Bild(er)" : "";
                }
                var cellRect = new Rectangle(rect.GetX() + i * colWidth, y - rowHeight, colWidth, rowHeight);
                using var canvas = new Canvas(currentPage, cellRect);
                canvas.Add(new Paragraph(value).SetFontSize(9).SetTextAlignment(TextAlignment.LEFT).SetVerticalAlignment(VerticalAlignment.MIDDLE));
            }
            y -= rowHeight;
        }
    }

    private static string FieldLabel(string key) => key switch
    {
        "roomName" => "Raum/Objekt",
        "category" => "Kategorie",
        "siteName" => "Standort",
        _ => key
    };

    private static void RenderRepeatBlock(
        PdfDocument pdfDocument, PdfPage startPage, PageDesign page, DesignElement element,
        Dictionary<string, string> variables, List<RoomRenderData> rooms, Dictionary<string, string> fieldTypesByName,
        PageSize pageSize, Dictionary<int, (string header, string footer)> headerFooterMap)
    {
        var fields = element.Fields ?? new List<string>();
        if (fields.Count == 0 || rooms.Count == 0) return;

        var currentPage = startPage;
        var rect = ToRect(element, pageSize.GetHeight());
        var blockHeight = rect.GetHeight();
        var y = rect.GetY() + rect.GetHeight();
        var bottomLimit = Margin + FooterBandHeight;

        foreach (var room in rooms)
        {
            if (y - blockHeight < bottomLimit)
            {
                currentPage = pdfDocument.AddNewPage(pageSize);
                headerFooterMap[pdfDocument.GetPageNumber(currentPage)] = (page.HeaderText ?? "", page.FooterText ?? "");
                y = pageSize.GetHeight() - Margin - HeaderBandHeight - 8;
            }

            var blockRect = new Rectangle(rect.GetX(), y - blockHeight, rect.GetWidth(), blockHeight);
            using (var borderCanvas = new Canvas(currentPage, blockRect))
            {
                var pdfCanvas = borderCanvas.GetPdfCanvas();
                pdfCanvas.SaveState();
                pdfCanvas.SetStrokeColor(ColorFromHex("#e2e8f0"));
                pdfCanvas.Rectangle(blockRect.GetX(), blockRect.GetY(), blockRect.GetWidth(), blockRect.GetHeight());
                pdfCanvas.Stroke();
                pdfCanvas.RestoreState();
            }

            // Determine if one of the selected fields is an image field -> render it as a photo on the left.
            var imageField = fields.FirstOrDefault(f => fieldTypesByName.TryGetValue(f, out var t) && t == "image");
            var textFields = fields.Where(f => f != imageField).ToList();
            var photoWidth = imageField != null ? Math.Min(blockHeight * 1.2f, rect.GetWidth() * 0.35f) : 0f;

            if (imageField != null)
            {
                var images = SplitImageValue(ResolveFieldValue(room, imageField, variables));
                if (images.Count > 0)
                {
                    try
                    {
                        var bytes = DecodeDataUrl(images[0]);
                        var img = new Image(ImageDataFactory.Create(bytes));
                        var imgRect = new Rectangle(blockRect.GetX() + 6, blockRect.GetY() + 6, photoWidth - 12, blockHeight - 12);
                        img.ScaleToFit(imgRect.GetWidth(), imgRect.GetHeight());
                        using var imgCanvas = new Canvas(currentPage, imgRect);
                        imgCanvas.Add(img);
                    }
                    catch { /* skip broken image */ }
                }
            }

            var textRect = new Rectangle(blockRect.GetX() + photoWidth + 8, blockRect.GetY() + 6, blockRect.GetWidth() - photoWidth - 16, blockHeight - 12);
            using (var textCanvas = new Canvas(currentPage, textRect))
            {
                foreach (var field in textFields)
                {
                    var value = ResolveFieldValue(room, field, variables);
                    textCanvas.Add(new Paragraph($"{FieldLabel(field)}: {value}").SetFontSize(10).SetMultipliedLeading(1.2f));
                }
            }

            y -= blockHeight;
        }
    }

    private static string Substitute(string text, Dictionary<string, string> variables)
    {
        if (string.IsNullOrEmpty(text)) return text ?? "";
        foreach (var kvp in variables)
        {
            text = text.Replace(kvp.Key, kvp.Value ?? "");
        }
        return text;
    }

    private static byte[] DecodeDataUrl(string dataUrl)
    {
        var commaIndex = dataUrl.IndexOf(',');
        var base64 = commaIndex >= 0 ? dataUrl[(commaIndex + 1)..] : dataUrl;
        return Convert.FromBase64String(base64);
    }

    private static DeviceRgb ColorFromHex(string hex)
    {
        try
        {
            hex = hex.TrimStart('#');
            if (hex.Length == 3)
            {
                hex = string.Concat(hex.Select(c => new string(c, 2)));
            }
            var r = Convert.ToInt32(hex.Substring(0, 2), 16);
            var g = Convert.ToInt32(hex.Substring(2, 2), 16);
            var b = Convert.ToInt32(hex.Substring(4, 2), 16);
            return new DeviceRgb(r, g, b);
        }
        catch
        {
            return new DeviceRgb(0, 0, 0);
        }
    }
}
