# Changelog

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
