using System.Text.Json;
using iText.IO.Font.Constants;
using iText.IO.Image;
using iText.Kernel.Colors;
using iText.Kernel.Font;
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

    // Für die Breiten-Abschätzung beim Kürzen langer Tabellenzellen-Texte (siehe TruncateForTableCell) -
    // Helvetica entspricht der iText-Standardschrift, die Paragraph ohne explizites SetFont() verwendet.
    private static readonly PdfFont TableCellFont = PdfFontFactory.CreateFont(StandardFonts.HELVETICA);

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
        /// <summary>Optional cap on rows rendered per page for table elements; overflow continues on new pages.</summary>
        public int? MaxRowsPerPage { get; set; }
        /// <summary>
        /// Sub-elements positioned relative to the repeat-block's own top-left corner (0,0), used only when
        /// Type == "repeat-block". When set (non-empty), these fully replace the legacy auto-layout (image left,
        /// stacked "Label: value" lines) with a free-form per-iteration mini-canvas.
        /// </summary>
        public List<DesignElement>? Children { get; set; }
        /// <summary>For repeat-block children of Type == "repeat-field": the bound room/template/site field key (e.g. "roomName", "category", "siteName" or a template field name).</summary>
        public string? FieldKey { get; set; }
        /// <summary>For repeat-block children of Type == "repeat-field": skip rendering this child entirely for an iteration whose resolved value is empty.</summary>
        public bool HideIfEmpty { get; set; }
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
        /// <summary>Horizontal alignment ("left"/"center"/"right") of this page's header/footer text relative to the print area.</summary>
        public string HeaderAlign { get; set; } = "center";
        public string FooterAlign { get; set; } = "center";
        public List<DesignElement> Elements { get; set; } = new();
    }

    public sealed class DesignConfig
    {
        public string GlobalHeaderText { get; set; } = "";
        public string GlobalFooterText { get; set; } = "";
        public string GlobalHeaderAlign { get; set; } = "center";
        public string GlobalFooterAlign { get; set; } = "center";
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
            var headerFooterMap = new Dictionary<int, (string header, string footer, TextAlignment headerAlign, TextAlignment footerAlign)>();

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
        Dictionary<int, (string header, string footer, TextAlignment headerAlign, TextAlignment footerAlign)> headerFooterMap)
    {
        var isLandscape = page.Orientation == "landscape";
        var pageSize = isLandscape ? new PageSize(CanvasHeight, CanvasWidth) : new PageSize(CanvasWidth, CanvasHeight);
        var pdfPage = pdfDocument.AddNewPage(pageSize);
        var pageHeight = pageSize.GetHeight();
        var pageWidth = pageSize.GetWidth();

        var headerText = ResolveHeader(page, config);
        var footerText = ResolveFooter(page, config);
        headerFooterMap[pdfDocument.GetPageNumber(pdfPage)] = (headerText ?? "", footerText ?? "", ResolveHeaderAlign(page, config), ResolveFooterAlign(page, config));

        // All repeat-blocks on this logical page are iterated together in lock-step (same room index, shared
        // page-break decisions), so that two or more repeat-blocks placed on one page (e.g. via "Block duplizieren")
        // always stay in sync instead of each independently looping over every room and creating its own pages.
        var repeatBlocksOnPage = page.Elements.Where(e => e.Type == "repeat-block").ToList();
        if (repeatBlocksOnPage.Count > 0)
        {
            RenderRepeatBlocksForPage(pdfDocument, pdfPage, page, repeatBlocksOnPage, variables, rooms, fieldTypesByName, pageSize, headerFooterMap, config);
        }

        foreach (var element in page.Elements)
        {
            switch (element.Type)
            {
                case "table":
                    RenderTable(pdfDocument, pdfPage, page, element, variables, rooms, fieldTypesByName, pageSize, headerFooterMap, config);
                    break;
                case "repeat-block":
                    // Handled once, together with any sibling repeat-blocks, via RenderRepeatBlocksForPage above.
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

    private static string ResolveHeader(PageDesign page, DesignConfig config) => page.UseGlobalHeader ? config.GlobalHeaderText : page.HeaderText;
    private static string ResolveFooter(PageDesign page, DesignConfig config) => page.UseGlobalHeader ? config.GlobalFooterText : page.FooterText;
    private static TextAlignment ResolveHeaderAlign(PageDesign page, DesignConfig config) => ToTextAlignment(page.UseGlobalHeader ? config.GlobalHeaderAlign : page.HeaderAlign);
    private static TextAlignment ResolveFooterAlign(PageDesign page, DesignConfig config) => ToTextAlignment(page.UseGlobalHeader ? config.GlobalFooterAlign : page.FooterAlign);
    private static TextAlignment ToTextAlignment(string? align) => align switch
    {
        "left" => TextAlignment.LEFT,
        "right" => TextAlignment.RIGHT,
        _ => TextAlignment.CENTER
    };

    private static void StampHeaderFooter(PdfPage pdfPage, Dictionary<string, string> variables, Dictionary<int, (string header, string footer, TextAlignment headerAlign, TextAlignment footerAlign)> headerFooterMap)
    {
        var pageNumber = pdfPage.GetDocument().GetPageNumber(pdfPage);
        if (!headerFooterMap.TryGetValue(pageNumber, out var texts)) return;

        var pageSize = pdfPage.GetPageSize();
        var pageHeight = pageSize.GetHeight();
        var pageWidth = pageSize.GetWidth();

        // Kopf-/Fußzeile werden bewusst außerhalb des Druckbereichs positioniert (im oberen/unteren
        // Seitenrand), damit sie sich nicht mit im Druckbereich platzierten Design-Elementen überschneiden
        // können — sowohl am Bildschirm (Canvas-Vorschau) als auch beim tatsächlichen Ausdruck.
        const float bandGapFromPrintArea = 3f;

        if (!string.IsNullOrWhiteSpace(texts.header))
        {
            var text = Substitute(texts.header, variables);
            var rect = new Rectangle(Margin, pageHeight - Margin + bandGapFromPrintArea, pageWidth - Margin * 2, HeaderBandHeight);
            using var canvas = new Canvas(pdfPage, rect);
            canvas.Add(new Paragraph(text).SetFontSize(9).SetFontColor(ColorFromHex("#64748b")).SetTextAlignment(texts.headerAlign));
        }

        if (!string.IsNullOrWhiteSpace(texts.footer))
        {
            var text = Substitute(texts.footer, variables);
            var rect = new Rectangle(Margin, Margin - bandGapFromPrintArea - FooterBandHeight, pageWidth - Margin * 2, FooterBandHeight);
            using var canvas = new Canvas(pdfPage, rect);
            canvas.Add(new Paragraph(text).SetFontSize(9).SetFontColor(ColorFromHex("#64748b")).SetTextAlignment(texts.footerAlign));
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
        RenderDividerRect(pdfPage, element.Style, ToRect(element, pageHeight));
    }

    private static void RenderDividerRect(PdfPage pdfPage, DesignStyle style, Rectangle rect)
    {
        var pdfCanvas = new PdfCanvas(pdfPage);
        pdfCanvas.SaveState();
        pdfCanvas.SetFillColor(ColorFromHex(string.IsNullOrWhiteSpace(style.Background) || style.Background == "transparent" ? "#94a3b8" : style.Background));
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
        PageSize pageSize, Dictionary<int, (string header, string footer, TextAlignment headerAlign, TextAlignment footerAlign)> headerFooterMap, DesignConfig config)
    {
        var fields = element.Fields ?? new List<string>();
        if (fields.Count == 0 || rooms.Count == 0)
        {
            RenderTextElement(startPage, new DesignElement { X = element.X, Y = element.Y, Width = element.Width, Height = element.Height, Content = "Keine Daten vorhanden.", Style = element.Style }, variables, pageSize.GetHeight());
            return;
        }

        var currentPage = startPage;
        var rect = ToRect(element, pageSize.GetHeight());
        // 30pt statt zuvor 20pt: bietet Platz für bis zu 2 Textzeilen bei 9pt Schriftgröße (vorher wurde ein
        // langer Zellenwert einfach nach dem ersten Teilstück abgeschnitten, ohne jeden Hinweis darauf).
        var rowHeight = 30f;
        var headerHeight = 22f;
        var y = rect.GetY() + rect.GetHeight();
        // Optionaler Deckel für die Zeilenanzahl pro Seite; bei Überschreitung wird eine neue Seite mit
        // wiederholter Kopfzeile begonnen, auch wenn der Druckbereich selbst noch Platz hätte.
        var maxRows = element.MaxRowsPerPage is > 0 ? element.MaxRowsPerPage.Value : (int?)null;
        var rowsOnCurrentPage = 0;

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
            if (y - rowHeight < bottomLimit || (maxRows.HasValue && rowsOnCurrentPage >= maxRows.Value))
            {
                currentPage = pdfDocument.AddNewPage(pageSize);
                headerFooterMap[pdfDocument.GetPageNumber(currentPage)] = (ResolveHeader(page, config), ResolveFooter(page, config), ResolveHeaderAlign(page, config), ResolveFooterAlign(page, config));
                y = pageSize.GetHeight() - Margin - HeaderBandHeight - 8;
                DrawHeader(new Rectangle(rect.GetX(), y, rect.GetWidth(), rect.GetHeight()));
                rowsOnCurrentPage = 0;
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
                var displayValue = TruncateForTableCell(value, 9f, colWidth, maxLines: 2);
                canvas.Add(new Paragraph(displayValue).SetFontSize(9).SetTextAlignment(TextAlignment.LEFT).SetVerticalAlignment(VerticalAlignment.MIDDLE));
            }
            y -= rowHeight;
            rowsOnCurrentPage++;
        }
    }

    /// <summary>
    /// Kürzt einen Zellenwert so, dass er voraussichtlich innerhalb von <paramref name="maxLines"/>
    /// Textzeilen bei gegebener Spaltenbreite passt, und hängt bei Kürzung "..." an (statt den Text
    /// kommentarlos mitten im Wort abzuschneiden/verschwinden zu lassen, wie es zuvor implizit durch
    /// das Überlaufverhalten der festen Zellenhöhe passierte). Die Schätzung basiert auf der tatsächlich
    /// gemessenen Textbreite der Standardschrift (Helvetica) und ist bewusst etwas konservativ (nutzt die
    /// volle Spaltenbreite als Zeilenbudget je Zeile), da der exakte Zeilenumbruch von Wortgrenzen abhängt.
    /// </summary>
    private static string TruncateForTableCell(string text, float fontSize, float colWidth, int maxLines)
    {
        if (string.IsNullOrEmpty(text)) return text;
        const float horizontalPadding = 6f; // kleiner Sicherheitsabstand zu den Zellenrändern
        var usableWidth = Math.Max(colWidth - horizontalPadding, 10f);
        var budget = usableWidth * maxLines;
        if (TableCellFont.GetWidth(text, fontSize) <= budget) return text;

        const string ellipsis = "…";
        var low = 0;
        var high = text.Length;
        var best = ellipsis;
        while (low <= high)
        {
            var mid = (low + high) / 2;
            var candidate = text.Substring(0, mid).TrimEnd() + ellipsis;
            if (TableCellFont.GetWidth(candidate, fontSize) <= budget)
            {
                best = candidate;
                low = mid + 1;
            }
            else
            {
                high = mid - 1;
            }
        }
        return best;
    }

    private static string FieldLabel(string key) => key switch
    {
        "roomName" => "Raum/Objekt",
        "category" => "Kategorie",
        "siteName" => "Standort",
        _ => key
    };

    /// <summary>
    /// Renders every repeat-block on a logical page together, in lock-step: all blocks render the same room on the
    /// same iteration, and a page-break is shared (if any block would overflow, ALL blocks move to a new page at
    /// once). This keeps two or more repeat-blocks placed on one page (e.g. via "Block duplizieren") visually in
    /// sync instead of each one independently looping over every room and creating its own, unrelated pages - which
    /// previously caused scrambled/duplicated output when more than one repeat-block existed on the same page.
    /// Each block restarts at its own originally-designed vertical position on every new page (not a shared
    /// top-of-page offset), so the layout the user designed is preserved across page breaks.
    /// </summary>
    private static void RenderRepeatBlocksForPage(
        PdfDocument pdfDocument, PdfPage startPage, PageDesign page, List<DesignElement> blocks,
        Dictionary<string, string> variables, List<RoomRenderData> rooms, Dictionary<string, string> fieldTypesByName,
        PageSize pageSize, Dictionary<int, (string header, string footer, TextAlignment headerAlign, TextAlignment footerAlign)> headerFooterMap, DesignConfig config)
    {
        if (rooms.Count == 0 || blocks.Count == 0) return;

        var currentPage = startPage;
        var bottomLimit = Margin + FooterBandHeight;

        // Precompute each block's rect/height and its own starting Y (the vertical position it was designed at).
        var rects = blocks.ToDictionary(b => b, b => ToRect(b, pageSize.GetHeight()));
        var heights = blocks.ToDictionary(b => b, b => rects[b].GetHeight());
        var startY = blocks.ToDictionary(b => b, b => rects[b].GetY() + rects[b].GetHeight());
        var cursorY = blocks.ToDictionary(b => b, b => startY[b]);

        foreach (var room in rooms)
        {
            var needsNewPage = blocks.Any(b => cursorY[b] - heights[b] < bottomLimit);
            if (needsNewPage)
            {
                currentPage = pdfDocument.AddNewPage(pageSize);
                headerFooterMap[pdfDocument.GetPageNumber(currentPage)] = (ResolveHeader(page, config), ResolveFooter(page, config), ResolveHeaderAlign(page, config), ResolveFooterAlign(page, config));
                foreach (var b in blocks) cursorY[b] = startY[b];
            }

            foreach (var block in blocks)
            {
                var rect = rects[block];
                var blockHeight = heights[block];
                var blockRect = new Rectangle(rect.GetX(), cursorY[block] - blockHeight, rect.GetWidth(), blockHeight);

                if (block.Children is { Count: > 0 })
                {
                    RenderFreeFormBlockIteration(currentPage, block, blockRect, room, variables, fieldTypesByName);
                }
                else
                {
                    var fields = block.Fields ?? new List<string>();
                    if (fields.Count > 0)
                    {
                        RenderLegacyBlockIteration(currentPage, fields, blockRect, room, variables, fieldTypesByName);
                    }
                }

                cursorY[block] -= blockHeight;
            }
        }
    }

    /// <summary>Renders exactly one room's data into the legacy auto-layout (border + optional photo on the left + stacked "Label: value" lines) for a single repeat-block iteration.</summary>
    private static void RenderLegacyBlockIteration(
        PdfPage currentPage, List<string> fields, Rectangle blockRect, RoomRenderData room,
        Dictionary<string, string> variables, Dictionary<string, string> fieldTypesByName)
    {
        var blockHeight = blockRect.GetHeight();
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
        var photoWidth = imageField != null ? Math.Min(blockHeight * 1.2f, blockRect.GetWidth() * 0.35f) : 0f;

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
    }

    /// <summary>
    /// Renders exactly one room's data into a free-form repeat-block's user-arranged sub-elements
    /// (<see cref="DesignElement.Children"/>), positioned relative to the block's own top-left corner, for a
    /// single repeat-block iteration.
    /// </summary>
    private static void RenderFreeFormBlockIteration(
        PdfPage currentPage, DesignElement element, Rectangle blockRect, RoomRenderData room,
        Dictionary<string, string> variables, Dictionary<string, string> fieldTypesByName)
    {
        foreach (var child in element.Children!)
        {
            var childRect = ToChildRect(child, blockRect);
            switch (child.Type)
            {
                case "divider":
                    RenderDividerRect(currentPage, child.Style, childRect);
                    break;
                case "rectangle":
                {
                    using var boxCanvas = new Canvas(currentPage, childRect);
                    ApplyBox(boxCanvas, child.Style, childRect);
                    break;
                }
                case "image-static":
                    RenderImageInRect(currentPage, child.ImageData, childRect);
                    break;
                case "repeat-field":
                {
                    var value = ResolveFieldValue(room, child.FieldKey ?? "", variables);
                    var isImageField = !string.IsNullOrEmpty(child.FieldKey) && fieldTypesByName.TryGetValue(child.FieldKey, out var fType) && fType == "image";
                    if (isImageField)
                    {
                        var images = SplitImageValue(value);
                        if (images.Count == 0) { if (child.HideIfEmpty) continue; break; }
                        RenderImageInRect(currentPage, images[0], childRect);
                    }
                    else
                    {
                        if (child.HideIfEmpty && string.IsNullOrWhiteSpace(value)) continue;
                        var text = $"{child.Content}{value}";
                        using var canvas = new Canvas(currentPage, childRect);
                        ApplyBox(canvas, child.Style, childRect);
                        canvas.Add(BuildStyledParagraph(text, child.Style));
                    }
                    break;
                }
                default: // "text" and any other textual child kind: static text, only global variables substituted
                {
                    var text = Substitute(child.Content, variables);
                    using var canvas = new Canvas(currentPage, childRect);
                    ApplyBox(canvas, child.Style, childRect);
                    canvas.Add(BuildStyledParagraph(text, child.Style));
                    break;
                }
            }
        }
    }

    /// <summary>Maps a repeat-block child's block-relative coordinates (origin = block's own top-left corner) to an absolute PDF rectangle within blockRect.</summary>
    private static Rectangle ToChildRect(DesignElement child, Rectangle blockRect)
    {
        var childY = blockRect.GetY() + blockRect.GetHeight() - child.Y - child.Height;
        return new Rectangle(blockRect.GetX() + child.X, childY, Math.Max(1f, child.Width), Math.Max(1f, child.Height));
    }

    private static void RenderImageInRect(PdfPage pdfPage, string? imageData, Rectangle rect)
    {
        if (string.IsNullOrWhiteSpace(imageData)) return;
        try
        {
            var bytes = DecodeDataUrl(imageData);
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

    private static string Substitute(string text, Dictionary<string, string> variables)
    {
        if (string.IsNullOrEmpty(text)) return text ?? "";
        foreach (var kvp in variables)
        {
            text = text.Replace(kvp.Key, kvp.Value ?? "");
        }
        return text;
    }

    // Liest Bildbytes sowohl aus alten eingebetteten "data:image/...;base64,..."-Werten als auch aus
    // neuen "/api/media/{name}"-Verweisen (siehe MediaStore) - so lassen sich auch ältere Backups mit
    // noch nicht ausgelagerten Bildern weiterhin korrekt zu PDF rendern.
    private static byte[] DecodeDataUrl(string dataUrl)
    {
        var resolved = MediaStore.ResolveImageBytes(dataUrl);
        if (resolved is null) throw new FormatException("Bilddaten konnten nicht aufgelöst werden.");
        return resolved.Value.Bytes;
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
