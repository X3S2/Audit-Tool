# Changelog

## [1.7.5] - 2026-10-10

### WYSIWYG PDF-Designer, Backup Download/Upload & Fixes

#### WYSIWYG PDF-Designer (komplett neu — `PdfDesignerCanvas.tsx`)
- **DIN A4 Weißes Blatt** als Canvas (595×842px, 75% Maßstab)
- **Drag & Drop**: Elemente mit der Maus frei verschieben
- **Größe ändern**: Resize-Anfasser rechts unten per Maus
- **7 Elementtypen** per Toolbar einfügbar:
  - `T Text` — Freitext, doppelklicken zum Bearbeiten
  - `⟨⟩ Variable` — Platzhalter (z.B. `{{siteName}}`, `{{date}}`, Vorlagenfelder)
  - `📷 Bild` — Bild-Platzhalter (wird bei PDF-Export mit Auditbild befüllt)
  - `📊 Tabelle` — Datentabelle mit wählbaren Spalten aus der Vorlage
  - `🔄 Wiederholen` — Wiederholender Block pro Raum (Mail-Merge-Prinzip)
  - `— Linie` — Trennlinie
  - `▭ Box` — Rechteck/Rahmen
- **Eigenschaften-Panel** (rechts):
  - Position (X/Y), Größe (Breite/Höhe) numerisch
  - Schriftgröße, Bold, Italic, Ausrichtung (Links/Mitte/Rechts)
  - Textfarbe, Hintergrundfarbe, Rahmen ein/aus
  - Variablen-Bindung aus Dropdown (alle Audit-Felder)
  - Tabellen/Repeat-Felder aus gewählter Vorlage
- **Vorlage auswählen** im Designer-Header für Feld-Bindungen
- **Speichern** speichert alle Canvas-Elemente als JSON im Backend

#### Backup — Download & Upload
- **⬇ Download**: Backup direkt als ZIP herunterladen (lokal speichern)
- **📤 Backup hochladen**: ZIP-Datei hochladen für Restore auf neuem System
- Backend: `GET /api/admin/backups/{id}/download`
- Backend: `POST /api/admin/backups/upload`
- Typ-Spalte in Backup-Tabelle (Vollbackup / Hochgeladen)

### Status
- ✅ TypeScript Build: 0 Fehler (24 Module)
- ✅ Docker Rebuild: Erfolgreich
- ✅ GitHub: `6157a37` auf master

## [1.7.4] - 2026-10-10

### PDF-Designer, Checklisten & UX-Fixes

#### Mobile NAV
- **Sidebar standardmäßig eingeklappt** auf kleinen Bildschirmen (≤ 768px)
- Menu-Toggle im Header klappt Sidebar ein/aus (funktioniert auf Desktop & Mobile)

#### Vorlagen Feld-Builder
- **Feldname-Eingabe breiter** (flex: 1 statt fester Breite → viel mehr Platz)
- **Typ-Dropdown kompakter** (max-width: 120px)
- **Dropdown-Optionen**: Wenn Typ „Auswahl (Dropdown)" gewählt wird, erscheint ein zusätzliches Eingabefeld für die Auswahloptionen (kommagetrennt)

#### PDF-Designer (vollständig neu)
- **Backend**: Neue Endpunkte `GET/POST/PUT/DELETE /api/pdfdesigns`
- **Model**: PdfDesign (Id, Name, Description, ConfigJson, CreatedAtUtc)
- **Frontend**: Übersicht → Neues Design anlegen → Editor
- **Editor-Funktionen**:
  - Seiten/Abschnitte verwalten:
    - + Deckblatt, + Raumtabelle (wiederholend), + Freitext, + Zusammenfassung
    - Abschnittstitel umbenennen
    - Seitenausrichtung (Hochkant/Querformat) pro Abschnitt
  - Globale Einstellungen: Kopfzeile, Fußzeile, Standard-Orientierung
  - Deckblatt-Felder wählbar: Standortname, Kategorie, Adresse, Telefon, Hausmeister, Audit-Titel, Datum, Ersteller
  - Raumtabellen-Spalten: Vorlage wählen → Felder als Spalten auswählen
  - Speichern-Button

#### Checklisten (vollständig neu)
- **Backend**: Neue Endpunkte `GET/POST/PUT/DELETE /api/checklisttemplates`
- **Backend**: `GET /api/audits/{id}/checklist` + `PUT /api/audits/{id}/checklist/{entryId}` für Live-Sync
- **Model**: ChecklistTemplate (Id, Name, TemplateId, ColumnsJson, CreatedAtUtc)
- **Frontend**: Checkliste erstellen mit:
  - + Raum-Spalte: Zeigt den Raumnamen
  - + Vorlagen-Feld-Spalte: Aus den Feldern der gewählten Audit-Vorlage
  - + Freie Spalte: Eigener Spaltenname + Typ (Text/Zahl/Checkbox)
  - Spalten-Reihenfolge nummeriert
  - Löschen-Button für Spalten
  - Speichern und Löschen von Checklisten-Templates

### Status
- ✅ TypeScript Build: 0 Fehler
- ✅ Docker Rebuild: Erfolgreich
- ✅ Backend: Alle neuen API-Endpunkte erreichbar
- ✅ GitHub: `5a3dacc` auf master

## [1.7.3] - 2026-10-10

### Design & UX Komplettüberarbeitung

#### Header-Fixes
- **Logo-Badge "A" entfernt** — kompakterer, saubererer Header (56px hoch)
- **Dropdown-Overlay-Fix** — Profil-Dropdown klappt jetzt über den Header auf, Header-Größe bleibt unverändert (`position: absolute, z-index: 9999`)
- **Click-Outside** — Dropdown schließt sich beim Klick außerhalb (`useRef + useEffect`)

#### Audit-Verbesserungen
- **Listenansicht als Standard** — statt Kacheln; Toggle (☰/⊞) speichert Einstellung pro Browser (`localStorage`)
- **Vorlage-Auswahl** — Beim Öffnen eines Standorts muss zuerst eine Audit-Vorlage gewählt werden. Alle nachfolgenden Daten (Räume, Grunddaten, Dokumente) sind vorlagenspezifisch
- **Formulare oben** — Raum anlegen und Audit erstellen sind jetzt über der Tabelle
- **Dokumente-Tab** — Korrekte Bezeichnung "Audit-Dokument erstellen" statt "Neues Audit anlegen"

#### Datenablage-Verbesserungen
- **Gleiche Hierarchie wie Audits** — Kategorie → Standort → 3 Tabs (Räume, Grunddaten, Dokumente)
- **Räume-Tab** — Zeigt Räume mit jeweils zugehörigen Audit-Dokumenten als Unterordner
- **Read-Only** — Kein Erstellen/Bearbeiten in der Datenablage

#### Einstellungen-Verbesserungen
- **Formulare oben, Tabellen unten** — Kategorien, Standorte, Vorlagen
- **Interaktiver Feld-Builder** (Vorlagen) — Ersetzt die alte Textarea:
  - Felder mit Name, Typ (Text/Zahl/Dropdown/Langer Text/Checkbox/Bild)
  - Pflichtfeld-Toggle für Fortschrittsbalken-Relevanz
  - Reihenfolge-Nummern visuell angezeigt
  - Feld hinzufügen / entfernen

#### Admin-Verbesserungen
- **Benutzerverwaltung**: "Benutzer anlegen" Button (togglebar) über der Liste
- **Benutzer bearbeiten**: Edit-Formular mit Anzeigename, Rolle, Passwort-Reset
- **Datenexport**: Zwei Modi — Einzelner Standort / Alle Standorte; verbessertes UI

#### CSS-Bugfixes
- **Tabs-Header Scrollbar** entfernt (`scrollbar-width: none`)
- **app-container Höhe** auf 56px Header angepasst

### Status
- ✅ TypeScript Build: 0 Fehler  
- ✅ Docker Rebuild: Erfolgreich
- ✅ Alle Container laufen
- ✅ GitHub Push: erfolgreich

## [1.7.2] - 2026-10-09

### Vollständiges UI/UX Redesign & Strukturkorrektur

#### Navigation (komplett überarbeitet)
- **Doppelte Emojis behoben**: Icon und Label sind jetzt getrennte Felder in NavItem
- **Korrektes Menü-Struktur** (wie in plan.md beschrieben):
  1. Dashboard
  2. Audits (keine Subpages im NAV — intern per Drill-Down)
  3. Datenablage (keine Subpages im NAV — intern per Drill-Down)
  4. Einstellungen ⚙️ (Admin only) → 5 Subpages: Kategorien, Standorte, Vorlagen, Checklisten, PDF-Designer
  5. Admin Page 👨‍💼 (Admin only) → 4 Subpages: Benutzer, Backup, Datenexport, Logs
  6. Profil (über Header-Dropdown erreichbar)
- **Sidebar Layout-Fix**: `app-container` erhält jetzt korrekte Grid-Styles (war vorher unter dem Header statt daneben)
- **Menu-Toggle**: Hamburger-Button im Header klappt Sidebar ein/aus

#### Audits — Hierarchische Drill-Down Navigation
- **Kategorie-Ansicht**: Alle Standort-Kategorien als Kacheln (A–Z sortiert)
- **Standort-Ansicht**: Standorte der gewählten Kategorie (A–Z sortiert)
- **Standort-Detail** mit 3 Tabs:
  - 🏠 Räume/Objekte: Raumliste + neuen Raum anlegen
  - 📋 Grunddaten: Standortinfos (Name, Adresse, Telefon, Hausmeister)
  - 📄 Dokumente: Audit-Liste + neues Audit anlegen + PDF-Export
- **Zurück-Button** auf jeder Ebene

#### Datenablage — Gleiche Struktur wie Audits
- Kategorie → Standort → Räume (mit Audit-Anzahl)

#### Einstellungen (Subpages korrekt)
- **Kategorien**: Standort-Kategorien anlegen/anzeigen
- **Standorte**: Standorte anlegen/anzeigen (Kategorie-Zuordnung)
- **Audit-Vorlagen**: Vorlagen anlegen/anzeigen (war vorher falsch in Audits-NAV)
- **Checklisten**: Platzhalter (kommt in späterer Version)
- **PDF-Designer**: Platzhalter (kommt in späterer Version)

#### Admin-Seiten (separate Seiten statt Tabs)
- Jede Subpage ist jetzt eine eigene Seite (nicht mehr Tab-basiert)
- Admin-Subpages im Sidebar bleiben nach dem Klick expanded

#### Design-Verbesserungen
- **Card-Grid** für Kategorien/Standort-Auswahl
- **Tab-Bar** für Standort-Detail-Reiter
- **Info-Grid** für Grunddaten-Anzeige
- **Back-Button** konsistent auf allen Drill-Down-Ebenen
- **Leerer-State-Hinweis** (.empty-hint) bei fehlenden Daten
- **Rollen-Badges** in Benutzerverwaltung
- **Status-Indikatoren** (aktiv/inaktiv) in Benutzerverwaltung

#### Weitere Bugfixes
- Dashboard 72%-Bug bereits in v1.7.1 behoben — Bestätigung dass korrekte Counts gezeigt werden
- toggleUserActive: 2-Argument-Aufruf auf 1-Argument korrigiert

### Status
- ✅ TypeScript Build: 0 Fehler
- ✅ Docker Rebuild: Erfolgreich
- ✅ Alle Container laufen
- ✅ GitHub Push: Erfolgreich

## [1.7.1] - 2026-10-09

### Bugfix & Navigation Improvements

#### Navigation Fixes
- **Admin-Subpages jetzt persistent klickbar**
  - Navigation State: `Set<string>` statt `string | null`
  - Expand/Collapse für alle Seiten erhaltbar
  - Subpage-Wechsel ohne Collapse
  - Benutzer, Backup, Export, Logs im Admin-Menü korrekt navigierbar

#### Dashboard Fixes
- **72%-Bug behoben**: Hardcodierter Wert entfernt
  - Dashboard zeigt jetzt: Standorte, Kategorien, Vorlagen, Audits (Count)
  - Dynamische Daten statt Placeholder-Prozentsatz

#### API Fixes
- **GET /api/objects entfernt**: 405-Fehler behoben
  - Frontend: Unnötige GET-Anfrage entfernt
  - Backend: Nur POST /api/objects wird verwendet
  - Brauchte objects nicht für die Anzeige

#### Geplant für v1.7.2
- ⏳ Buttons & Form-Controls: Modernes Design
- ⏳ Header mit Seitentitel & Menu-Toggle
- ⏳ CSS Overhaul für alle Seiten
- ⏳ Passwort-Button: Design & UX Verbesserungen

### Status
- ✅ Navigation vollständig funktionsfähig
- ✅ Alle Subpages klickbar
- ✅ Dashboard zeigt korrekte Stats
- ✅ API: Keine 405-Fehler mehr
- ✅ Frontend Build: Successful (23 modules)
- ✅ Docker Rebuild: Successful

## [1.7.0] - 2026-11-10

### Component Integration & UI Architecture Refactoring

#### Core Architecture
- **Modern Component System**: Vollständige Integration von v1.7.0 Komponenten
  - Header.tsx: Sticky top navigation mit Theme Toggle und Profile Dropdown
  - Navigation.tsx: Hierarchische Sidebar mit Expand/Collapse-Subpages
  - Tabs.tsx: Reusable Tab-Navigation mit Icons und aktiven States
  - Alert.tsx: Toast/Modal Alert-System für Error/Success/Info/Warning
- **Type Safety**: PageKey Type aus Navigation.tsx importiert
  - 13 neue Page-Keys unterstützen hierarchische Navigation
  - Full TypeScript compliance mit neuem Navigation-System

#### Navigation & Layout
- **Hierarchical Navigation Structure**:
  - Dashboard 📊
  - Audits 📋 → Räume & Objekte, Standorte, Vorlagen
  - Datenablage 💾 → Übersicht
  - Einstellungen ⚙️ (Admin only) → Konfiguration, System
  - Admin 👨‍💼 (Admin only) → Benutzer, Backup, Export, Logs
  - Profil 👤
- **Sticky Header**: Brand, Theme Toggle, Profile Dropdown
- **Sidebar Navigation**: Expandable subpages mit Chevron-Indikatoren
- **Main Content Area**: Padded, responsive layout

#### State Management
- **Error Banner**: Nur bei echten Fehlern anzeigen (not on fresh load)
  - Alert-Komponente mit `showErrorBanner && error` conditional
  - Close-Handler setzt error und banner state zurück
- **Profile Tabs**: 3-Tab Interface
  - Info: Readonly Benutzerinformationen
  - Theme: Dark/Light Mode Toggle
  - Password: Passwortänderung
- **Admin Tabs**: 4-Tab Interface
  - Benutzer: User Management
  - Backup: Backup erstellen/wiederherstellen
  - Export: Datenexport ZIP
  - Logs: System-Logs

#### Header Component
- **Profile Dropdown Integration**: onProfileClick handler für:
  - 'profile' → navigate to profil (info tab)
  - 'password' → navigate to profil (password tab)
  - 'logout' → logout and clear session
- **Theme Toggle**: Button mit Emoji (🌙/☀️)
- **User Avatar**: Initials-basiert mit displayName

#### Features Preserved
- ✅ All 25+ API handlers maintained (createAudit, addChecklistEntry, etc.)
- ✅ Complete session management and auth flow
- ✅ Image gallery with compression and upload
- ✅ Backup/Restore functionality
- ✅ PDF export for audits
- ✅ User password management
- ✅ Backup schedule configuration

### Migration Notes
- Old PageKey: 'dashboard' | 'audits' | 'standorte' | 'vorlagen' | 'raume' | 'admin' | 'profil'
- New PageKey: 'dashboard' | 'audits' | 'audits-raume' | 'audits-standorte' | 'audits-vorlagen' | 'datenablage' | 'einstellungen' | 'admin' | 'admin-benutzer' | 'admin-backup' | 'admin-export' | 'admin-logs' | 'profil'
- Navigation now supports subpages with automatic page switching
- Error handling improved with conditional banner display

### Status
- ✅ Components fully integrated in App.tsx
- ✅ TypeScript compilation: 0 errors
- ✅ Frontend build: Successful
- ✅ All business logic preserved and functional
- ✅ Ready for Docker rebuild and testing
- ✅ Toast CSS vorbereitet
- ✅ Alle Build-Fehler behoben

## [1.6.3] - 2026-10-09

### Bugfix
- **CORS Policy korrigiert**: `localhost:4714` hinzugefügt (Frontend-Port)
  - OPTIONS requests werden jetzt korrekt antwortet
  - Cross-Origin Requests vom Frontend funktionieren
- **Login-Form**: Placeholders entfernt
  - Benutzername-Feld: komplett leer
  - Passwort-Feld: komplett leer

### Status
- ✅ CORS Preflight (OPTIONS) funktioniert
- ✅ Login vom Browser funktioniert
- ✅ POST /api/auth/login nicht mehr blockiert

## [1.6.2] - 2026-10-09

### Bugfix
- **Login-Fehler behoben**: Default-Passwörter korrigiert
  - superadmin/admin: `Password123!` → `AuditTool!2026`
  - user/azubi: `Password123!` (unverändert)
- **docker-compose.yml fixes**:
  - Service-Namen korrigiert: `audit-postgres` → `audittool-postgres-db`
  - Connection String: Host und Passwort-Placeholder entfernt
  - Explizites Docker-Netzwerk hinzugefügt (`audittool-network`)
  - Bessere Service-Abhängigkeiten
- **Frontend-Login-Form**: Standard-Werte geleert (waren: "superadmin" / "Password123!")
- **README.md**: Test-Account-Tabelle hinzugefügt für alle 4 Standard-Benutzer

### Status
- ✅ Login funktioniert korrekt
- ✅ Docker-Container-Kommunikation funktioniert
- ✅ Alle Default-Benutzer erreichbar

## [1.6.1] - 2026-10-09

### Hinzugefügt
- Docker-Ordner umbenannt: `docker/` → `audittool/` (proper naming)
- Container-Namen aktualisiert: `audittool-frontend-ui`, `audittool-backend-api`, `audittool-postgres-db`
- Frontend Browser-Tab Title: "frontend" → "Audit-Tool"
- Frontend HTML lang Attribut: "en" → "de"
- Meta Description in Frontend index.html

### Geändert
- README.md komplett überarbeitet (von 2KB auf 13KB)
  - Detaillierte Architektur-Übersicht
  - Quick Start Anleitung
  - Security Best Practices
  - API Endpunkte Referenz
  - Docker Services Dokumentation
  - Troubleshooting Guide
  - Performance Metriken
- docker-compose.yml: Pfade aktualisiert auf `audittool/`

### Status
- **v1.6.1 Housekeeping Release** - Naming & Documentation überarbeitet
- Alle Container mit proper Namen: audittool-*
- Browser Tab zeigt jetzt "Audit-Tool" statt "frontend"
- README ist jetzt durchgehend gepflegt & aktuell

## [1.6.0] - 2026-10-09

### Hinzugefügt
- InputValidator für Frontend & Backend (Username, Password, Name, Description)
- Input-Sanitization gegen XSS-Payloads
- Payload-Größenlimitierungen (10MB max)
- Validierungsregeln: Passwort mindestens 8 Zeichen, Großbuchstaben, Kleinbuchstaben, Ziffer

### Status
- 6 Sicherheitsfeatures hinzugefügt

## [1.5.0] - 2026-10-09

### Hinzugefügt
- AuditLogger für Aktions- und Error-Logging
- RequestLoggingMiddleware für Request-Tracking
- JSONL-basierte Audit-Logs (audit_logs.jsonl)
- Error-Logs mit Stack-Traces (error_logs.jsonl)
- Auditierbar: POST, PUT, DELETE Requests

### Status
- Logging- und Diagnostics-System vollständig

## [1.4.0] - 2026-10-09

### Hinzugefügt
- RetryableHttpClient für Frontend (exponential backoff)
- CircuitBreakerMiddleware im Backend
- Circuit-Breaker Pattern: Closed → Open → Half-Open
- Retry-Logik mit konfigurierbarem Backoff (1s, 2s, 4s, 8s, 10s max)
- Automatische 30s Wartezeit vor Half-Open-Transition

### Status
- Robustes Error-Recovery implementiert

## [1.3.0] - 2026-10-09

### Hinzugefügt
- ErrorBoundary React-Komponente für Frontend
- GlobalExceptionHandler im Backend
- Strukturierte Error-Responses (StatusCode, Message, Timestamp)
- Fehlerdetails mit Stack-Traces (Development mode)
- Automatische Error-Klassifizierung (400, 403, 404, 500)

### Status
- Fehlerbehandlung auf beiden Seiten komplett

## [1.2.0] - 2026-10-09

### Hinzugefügt
- Token-Refresh-Endpunkt (POST /api/auth/refresh)
- RefreshTokenStore für Token-Persistierung
- Sliding-Window Token-Rotation (7-Tage Refresh-Token TTL)
- Token-Revocation bei Logout
- Automatische Token-Erneuerung ohne Re-Login

### Status
- Session-Management erweitert auf Token-Level

## [1.1.0] - 2026-10-09

### Hinzugefügt
- DatabaseMigrationService für SQLite→PostgreSQL Migration
- Schema-Erstellung in PostgreSQL
- Datenmigration aller 7 Haupttabellen
- Foreign-Key-Beziehungen
- JSONB-Support für komplexe Datentypen

### Status
- PostgreSQL-Produktion vorbereitet (optional)

## [1.0.1] - 2026-10-09

### Hinzugefügt
- BackupService als BackgroundService
- Automatische Backup-Ausführung nach Zeitplan
- Automatische Cleanup: Max Backups bewahren
- Logging von Backup-Operationen

### Status
- Automatische Backup-Ausführung aktiv

## [1.0.0] - 2026-10-09

### Hinzugefügt
- BackupSchedule Model für Zeitplan-Konfiguration
- BackupScheduleStore für SQLite-Persistierung
- GET /api/admin/backup-schedule Backend-Endpunkt
- PUT /api/admin/backup-schedule Backend-Endpunkt
- Frontend Backup-Zeitplan-UI im Admin-Panel
- Uhrzeit-Auswahl (time input)
- Wochentag-Checkboxes (Montag-Sonntag)
- Max Backups Konfiguration (1-100, default 10)

### Status
- **v1.0.0 markiert Produktive Reife** mit allen Kernfunktionen komplett

## [0.9.0] - 2026-10-09

### Hinzugefügt
- DELETE /api/objects/{objectId}/images/{imageName} Backend-Endpunkt
- deleteGalleryImage() Frontend-Handler mit Bestätigungsdialog
- Rot gefärbter "Löschen"-Button in jeder Bild-Galerie
- Automatische Galerie-Aktualisierung nach Bild-Löschung
- Error-Handling und Benutzer-Feedback für Fehlschläge

### Geändert
- Bild-Galerie erweitert: Löschen-Button unter jedem Bild
- Bild-Metadaten-Spacing angepasst für Button-Platz
- Frontend-Bundle-Größe unverändert (251.72 KB)

### Behoben
- Keine Fehler in dieser Version

### Features
- Benutzerbestätigung vor Löschung (Sicherheit)
- Sofortige Galerie-Aktualisierung nach erfolgreicher Löschung
- Fehlerbehandlung mit aussagekräftigen Meldungen
- Autorisierung erforderlich ([Authorize] im Backend)

## [0.8.1] - 2026-10-09

### Hinzugefügt
- theme.css mit CSS-Variablen für Dark- und Light-Mode
- Dark-Mode als Standard (originale Farbschema)
- Light-Mode mit hellen Farben und guter Lesbarkeit
- Sanfte Farbübergänge bei Theme-Wechsel (0.3s Transition)
- CSS-Variablen: --color-bg-primary, --color-text-primary, --color-accent, etc.

### Geändert
- App.css: Alle hartkodierten Farben durch CSS-Variablen ersetzt
- useEffect für Theme-Sync mit document.documentElement.className erweitert
- CSS-Bundle-Größe: 4.74 KB → 5.85 KB (+1.11 KB für Variablen)

### Behoben
- Keine Fehler in dieser Version

### Features
- Theme-Wechsel sofort aktiv ohne Seite neuladen
- Browser-Einstellung wird respektiert (localStorage: THEME_KEY)
- Theme-Toggle-Button (☀️/🌙) im Topbar sichtbar
- Alle UI-Elemente responsive auf Theme-Änderung

## [0.8.0] - 2026-10-09

### Hinzugefügt
- Clientseitige Bild-Komprimierung für Image-Uploads
- Canvas-basierte Bildern-Resize mit adaptiver Qualitätsreduktion
- Automatische Qualitätsanpassung zur Einhaltung des 5MB-Limits
- Maximale Bildauflösung: 1920x1920 Pixel
- Komprimierungsstatus-Feedback mit visuellen Indikatoren
- Bandbreite-Optimierung durch lokale Komprimierung statt Server-Komprimierung

### Geändert
- handleImageGalleryUpload: integriert compressImage() vor FormData-Upload
- Komprimierte Datei wird als new File() für Upload erstellt
- Frontend-Bundle-Größe um 1KB erhöht (251.68 KB komprimiert)

### Behoben
- Keine Fehler in dieser Version

### Hinweis
- Image-Delete-Funktionalität für v0.9.0 geplant
- Dark/Light Mode Toggle für v0.8.1 geplant

## [0.7.0] - 2026-10-09

### Hinzugefügt
- Frontend-Image-Gallery-Modal für Objektbilder
- Upload-Formular mit Datei-Input direkt im Modal
- Responsive Bild-Grid (4 Bilder pro Zeile auf Desktop)
- Bild-Metadaten-Anzeige (Dateigröße in KB, Upload-Datum)
- Real-time Bildlisten-Abruf von Backend API
- Upload-Status-Feedback mit visuellen Indikatoren
- "Bilder verwalten"-Button in Objekttabelle
- Styling: Border-Left-Highlight für aktives Galerie-Modal

### Geändert
- Objekttabelle um "Aktion"-Spalte erweitert
- Frontend-Dateigrößen von ~248KB auf 250KB (+2KB für neue UI)

### Behoben
- Keine Fehler in dieser Version

### Hinweis
- Image-Komprimierung für v0.8.0 geplant (clientseitig vor Upload)
- Bild-Delete-Funktionalität für v0.9.0 geplant

## [0.6.0] - 2026-10-09

### Hinzugefügt
- Bild-Download-Endpunkt GET /api/objects/{objectId}/images/{imageName} im Backend
- MIME-Type-Automatik-Erkennung (JPEG, PNG, GIF, WebP)
- Bild-Upload-Endpunkt POST /api/objects/{objectId}/images (bereits vorhanden, jetzt dokumentiert)
- Bild-Metadaten-Endpunkt GET /api/objects/{objectId}/images für Bildlisten-Abruf

### Geändert
- Backend-Architektur mit vollständigen Image-Management-Endpunkten erweitert
- Storage-Struktur: /storage/uploads/{objectId}/ für objektbasierte Bildverwaltung

### Behoben
- Keine Fehler in dieser Version

## [0.5.0] - 2026-10-09

### Hinzugefügt
- Bild-Komprimierungs-Modul (imageCompression.ts) mit Canvas-basierter Resize/Qualitäts-Reduktion
- compressImage() Funktion mit adaptiver Qualitätsanpassung zur Größenlimit-Einhaltung (Standard: 5MB)
- getCompressedFileName() Hilfsfunktion für Zeitstempel-basierte Dateinamen (Format: yyyyMMdd_HHmmss)
- Maximale Bildauflösung: 1920x1920 Pixel
- Vorbereitung für Frontend-Bild-Upload-UI in zukünftigen Versionen

### Geändert
- Frontend-Projektstruktur um Komprimierungs-Module erweitert
- package.json devDependencies validiert

### Behoben
- Keine Fehler in dieser Version

## [0.4.0] - 2026-10-09

### Hinzugefügt
- Automatische Backup-Rotation mit konfigurierbarem Limit (Standard: 10 Backups)
- ApplyBackupRotation-Methode für BackupStore zur Begrenzung alter Backups
- Älteste Backups werden automatisch gelöscht, wenn Maximallänge erreicht wird (rotierendes Backup-Modell wie bei Dashcams)
- Backup-Rotation wird automatisch nach jedem neuen Backup durchgeführt

### Geändert
- BackupStore Create-Methode um automatische Rotation erweitert
- Backup-Management nun rotierend für Speicherplatz-Kontrolle

### Behoben
- Unbegrenzte Backup-Speicherung verhindert durch automatische Rotation

## [0.3.0] - 2026-10-09

### Hinzugefügt
- Profil-Seite mit Passwortänderung für angemeldete Benutzer
- Backend-Endpunkt PUT /api/users/{id}/change-password für Passwortänderung mit aktuellem Passwort-Verifizierung
- Frontend-Formular für sichere Passwortänderung (Bestätigung, Mindestlänge 8 Zeichen)
- Erweiterte Profil-Anzeige mit Displayname, Rolle und Theme-Status

### Geändert
- Admin-Passwort-Reset-Endpunkt um Success-Flag erweitert
- Profil-Panel mit neuer Passwort-Änderungs-UI aktualisiert

### Behoben
- Keine bisher dokumentierten Fehler

## [0.2.1] - 2026-10-09

### Hinzugefügt
- PDF-Export-Funktionalität für Audits via iText7-Bibliothek
- Backend-Endpunkt GET /api/audits/{id}/pdf für PDF-Generierung
- Frontend-Schaltfläche "PDF" in der Audits-Tabelle für schnelle PDF-Downloads
- Bouncy Castle Crypto-Adapter für PDF-Verschlüsselung und Signatur-Unterstützung

### Geändert
- Audits-Tabelle um Aktions-Spalte mit PDF-Export-Button erweitert
- backend.csproj um itext7.bouncy-castle-adapter Abhängigkeit ergänzt

### Behoben
- iText7 fehlende Crypto-Bibliothek hinzugefügt (BouncyCastle-Integration)

## [0.2.0] - 2026-10-09

### Hinzugefügt
- Admin-User-Management mit Passwort-Reset, Aktivierung/Deaktivierung und Löschfunktion
- Neuer Benutzer-Erstellen-Dialog im Admin-Panel
- Rollenbasierte Zugriffskontrolle für Admin-Funktionen (Superadmin kann alles, Admin kann nur Benutzer und Azubi verwalten)
- Frontend-Handler für alle User-Management-Operationen

### Geändert
- Admin-Panel um neue Benutzer-Management-Operationen erweitert
- UserStore um zusätzliche Verwaltungsmethoden (GetById, UpdatePassword, ToggleActive, Delete)

### Behoben
- Admin-Operationen berücksichtigen nun Rolle-Hierarchie (Admin kann Superadmin nicht ändern)

## [0.1.2] - 2026-10-09

### Hinzugefügt
- Echte SQLite-Persistenz für Nutzer- und Auditdaten
- Datenbankbasierte Speicherung von Kategorien, Standorten, Templates, Räumen, Objekten und Audits
- Persistenter Seed- und Wiederherstellungszustand für Kernfunktionen

### Geändert
- UserStore und AuditStore von in-memory auf SQLite-Backed Store umgestellt
- README und Projektstatus um persistente Datenbasis erweitert

### Behoben
- Datenverlust beim Neustart bzw. Prozessrestart verhindert
- Admin-/Audit-Flows bleiben nach Server-Neustarts konsistent nutzbar

## [0.1.1] - 2026-10-09

### Hinzugefügt
- Stabilisierung der Upload- und Bild-Workflow-API für Objektbilder
- Laufzeit- und Smoke-Check für Health-Endpoint und Login-Flow dokumentiert

### Geändert
- Frontend- und Backend-Startpunkte für lokale Nutzung auf die aktuelle Laufzeitumgebung angepasst
- README-Status mit aktuellen Laufzeit- und Produktivhinweisen ergänzt

### Behoben
- Objektbild-Upload via multipart form-data stabilisiert, damit Bild-Uploads nicht mehr mit 400 Bad Request abbricht
- Builder-/Runtime-Blocker durch alte Backend-Prozesse beseitigt

## [0.1.0] - 2026-10-09

### Hinzugefügt
- Backup-Management im Adminbereich mit Erstellung, Wiederherstellung und Löschung
- Export-Workflow für ZIP-Dateien je Standort inkl. strukturierter Ordnerhierarchie
- Erweiterte Audit-, Raum- und Objekt-Management-Views im Frontend
- Docker-Port für die Produktiv-URL auf 4714 konfiguriert

### Geändert
- Admin-UI um Backup-/Export-Funktionen erweitert
- README und Projektstatus auf aktuelle Kernfunktionen aktualisiert

### Behoben
- Fehlerhafte Admin-Workflows und API-Handling für Datensicherung/Export aufgesetzt

## [0.0.0] - 2026-10-09

### Hinzugefügt
- Projektbasis mit React-Frontend und ASP.NET Core-Backend
- Rollenmodell mit Superadmin, Admin, Benutzer und Azubi
- 8-Stunden-Login-Session mit automatischer Abmeldung nach Ablauf
- Login-Flow, Dashboard, Standorte-, Audit- und Profilansichten
- Docker-Basis für Frontend, Backend und PostgreSQL
- README mit Git-Push-Checkliste und Sicherheitsanforderungen

### Geändert
- Initiale Projektstruktur für die erste produktive Version etabliert

### Behoben
- Keine bisher dokumentierten kritischen Fehler
