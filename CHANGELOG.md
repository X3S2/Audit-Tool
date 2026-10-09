# Changelog

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
