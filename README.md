# Audit-Tool

Ein deutschsprachiges Audit-Tool für Standorte, Räume, Objekte, Bilder, Checklisten und PDF-Exporte.

## Projektstatus
- Stack: React + TypeScript + ASP.NET Core + PostgreSQL
- Ziel: produktive erste Version mit allen Kernfunktionen
- Login-Timeout: 8 Stunden; nach Ablauf erfolgt automatische Abmeldung
- Port: 4714 für die Produktiv-URL, lokale Entwicklung nutzt 5050 API und 5173 Frontend
- Status: Kernfunktionen für Standorte, Räume, Objekte, Audits, Backup und ZIP-Export erweitert

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
   - Frontend: http://localhost:5173
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

## Git-Push-Checkliste
Vor jedem GitPush muss die folgende Liste abgearbeitet sein:

- [ ] README geprüft und aktualisiert
- [ ] Changelog aktualisiert
- [ ] Versionierung angepasst
- [ ] Backend kompiliert ohne Fehler
- [ ] Frontend buildet ohne Fehler
- [ ] Docker Compose validiert
- [ ] Auth/Rollen geprüft
- [ ] Bild-Uploads getestet
- [ ] Export-/ZIP-Workflow geprüft
- [ ] Backup/Restore geprüft
- [ ] Sicherheits- und Sessions-Checks durchgeführt
- [ ] Keine offenen kritischen Fehler in den Kernflows

## Projektstruktur
```text
Audit-Tool/
├── backend/
├── frontend/
├── docker/
├── docs/
├── storage/
│   ├── backups/
│   └── exports/
├── README.md
├── CHANGELOG.md
├── .gitignore
├── .env.example
├── docker/docker-compose.yml
└── docker/Dockerfile.*
```

## Wichtige Entwicklungsregeln
- Vollständig deutschsprachig
- Umlaute und Sonderzeichen in UI und Exporten beachten
- Session-Timeout 8 Stunden
- Docker-Container eindeutig benennen
- Nach größeren Features Changelog und Versionierung ergänzen
- Keine Secrets im Repository hinterlegen

## Changelog
Das Projekt verfolgt ein SemVer-Schema: X.Y.Z.

## Lizenz
Projekt intern / proprietär.
