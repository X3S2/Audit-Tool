# Audit-Tool

Ein deutschsprachiges Audit-Tool für Standorte, Räume, Objekte, Bilder, Checklisten und PDF-Exporte.

## Projektstatus
- Stack: React + TypeScript + ASP.NET Core + SQLite + iText7 für PDF-Export
- Ziel: produktive erste Version mit allen Kernfunktionen
- Login-Timeout: 8 Stunden; nach Ablauf erfolgt automatische Abmeldung
- Port: 4714 für die Produktiv-URL, lokale Entwicklung nutzt 5050 API und 5173/5174 Frontend (5173 falls frei, sonst Vite fallback 5174)
- Status: Kernfunktionen für Standorte, Räume, Objekte, Audits, Backup, ZIP-Export, PDF-Export, Bild-Uploads und echte SQLite-Persistenz implementiert
- Aktuelle Version: 0.2.1 (PDF-Export für Audits)

## Schnellstart

### Voraussetzungen
- .NET SDK 10+
- Node.js 22+
- Docker Desktop oder Docker Engine

### Lokale Entwicklung
1. Backend starten:
   ```bash
   cd backend
   dotnet run --urls http://localhost:5050
   ```
2. Frontend starten:
   ```bash
   cd frontend
   npm install
   npm run dev -- --host 0.0.0.0
   ```
3. Browser öffnen:
   - Frontend: http://localhost:5173 (falls belegt: http://localhost:5174)
   - Backend Swagger: http://localhost:5050/swagger

### Docker-Start
```bash
docker compose -f docker/docker-compose.yml up --build
```
Produktions-/Docker-URL: http://localhost:4714

## Standard-Accounts
- Superadmin / Password123!
- Admin / Password123!
- Benutzer / Password123!
- Azubi / Password123!

## Features der aktuellen Version (0.2.1)
- **Rollenmodell**: Superadmin, Admin, Benutzer, Azubi mit granularer Zugriffskontrolle
- **User-Management**: Admin-Panel für Passwort-Reset, Aktivierung/Deaktivierung, Löschung (Admin kann Superadmin nicht bearbeiten)
- **Audit-Management**: Audit-Erstellung, Checklistenentries, Status-Tracking
- **Standort- & Raum-Management**: Hierarchische Verwaltung von Kategorien, Standorten, Räumen und Objekten
- **PDF-Export**: Direkte PDF-Generierung für Audits (iText7)
- **Bild-Upload**: Multipart-Upload mit 5MB-Limit pro Datei
- **Backup & Export**: ZIP-Export mit hierarchischer Struktur, Backup-Management (Erstellen, Wiederherstellen, Löschen)
- **SQLite-Persistierung**: Echte Datenbankpersistenz statt In-Memory-Stores

## Git-Push-Checkliste
Vor jedem GitPush muss die folgende Liste abgearbeitet sein:

- [ ] README geprüft und aktualisiert
- [ ] Changelog aktualisiert (Keep-a-Changelog-Format auf Deutsch)
- [ ] Versionierung angepasst (SemVer: major.minor.patch)
- [ ] Backend kompiliert ohne Fehler
- [ ] Frontend TypeScript kompiliert und buildet ohne Fehler
- [ ] SQLite-Persistenz für Kernfunktionen validiert
- [ ] Login- und Session-Timeout (8h) geprüft
- [ ] Rollenzugriff geprüft
- [ ] Admin-User-Management-Endpunkte geprüft
- [ ] PDF-Export für Audits geprüft
- [ ] Bild-Upload getestet (5MB-Limit)
- [ ] Export-/ZIP-Workflow geprüft
- [ ] Backup/Restore geprüft
- [ ] Docker Compose validiert
- [ ] Sicherheits- und Sessions-Checks durchgeführt
- [ ] Keine offenen kritischen Fehler in den Kernflows

## Projektstruktur
```text
Audit-Tool/
├── backend/
│   ├── Program.cs (zentrale API-Endpunkte und AppDatabase-Klasse)
│   ├── backend.csproj (NuGet-Dependencies: itext7, itext7.bouncy-castle-adapter, SQLite, JWT)
│   └── bin/Debug/net10.0/
├── frontend/
│   ├── src/App.tsx (zentrale React-Komponente mit allen UI-Flows)
│   ├── src/App.css
│   └── package.json
├── docker/
│   ├── docker-compose.yml (Orchestrierung Backend, Frontend, Ports)
│   └── Dockerfile.*
├── docs/
├── storage/
│   ├── audit-tool.db (SQLite-Datenbankdatei, .gitignore)
│   ├── backups/
│   ├── exports/
│   └── uploads/ (Bilder nach {objectId} organisiert)
├── README.md
├── CHANGELOG.md
├── .gitignore
├── .env.example
└── plan.md + masterplan.md (Detaillierte Projektplanung)
```

## Wichtige Entwicklungsregeln
- Vollständig deutschsprachig (UI, Fehler, Dokumentation)
- Umlaute und Sonderzeichen in UI und Exporten beachten
- Session-Timeout 8 Stunden (JWT auf Backend, Storage-Clear auf Frontend)
- Docker-Container eindeutig benennen
- Nach größeren Features Changelog und Versionierung ergänzen (SemVer)
- Keine Secrets im Repository hinterlegen (.env in .gitignore)
- SQLite-Datenbankdatei wird nicht committed (storage/audit-tool.db in .gitignore)

## Bekannte Einschränkungen & Roadmap
- **SQLite für MVP**: Produktions-NAS-Deployment auf PostgreSQL geplant (0.3.x)
- **Keine Bild-Komprimierung**: JavaScript-basierte Komprimierung vor Upload geplant (0.3.x)
- **Kein Token-Refresh**: Nach 8h muss Benutzer sich neu anmelden (0.3.x geplant)
- **Backup-Management prototypisch**: Kein echter DB-Dump, nur JSON-Snapshot (0.3.x erweitern)
- **Mobile UI**: Noch nicht optimiert (0.4.x)

## Changelog
Das Projekt verfolgt ein Keep-a-Changelog-Format mit SemVer-Schema (X.Y.Z).
Siehe [CHANGELOG.md](./CHANGELOG.md).

## Lizenz
Projekt intern / proprietär.
