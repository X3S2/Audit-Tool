# 🎯 Audit-Tool v1.6.0 - Produktionsreife Audit-Management-Lösung

**Enterprise-Ready | Deutsch | React + ASP.NET Core + PostgreSQL | Docker**

---

## 📋 Überblick

**Audit-Tool** ist eine professionelle, deutschsprachige Web-Anwendung zur Verwaltung von Audits, Standorten, Räumen, Objekten, Bildern und Checklisten. Das System bietet erweiterte Funktionen für Benutzerverwaltung, PDF-Exporte, automatische Backups und ein sicheres Token-basiertes Authentifizierungssystem mit Audit-Logging.

### 🎯 Kernfunktionen (v1.6.0)

| Feature | Status | Version |
|---------|--------|---------|
| **Authentifizierung & Sessions** | ✅ | 8h Timeout + 7d Token-Refresh |
| **Benutzerverwaltung** | ✅ | Admin-Dashboard, Passwort-Reset |
| **Audit Management** | ✅ | CRUD, Status-Tracking, Checklisten |
| **Bildverwaltung** | ✅ | Upload, Galerie, Komprimierung, Delete |
| **Backup & Restore** | ✅ | Automatische Zeitplanung + Rotation |
| **PDF Export** | ✅ | iText7, Deutsche Umlaute |
| **Dark/Light Mode** | ✅ | CSS-Variablen, Persistierung |
| **Error Handling** | ✅ | Error Boundaries, Circuit Breaker |
| **Logging & Audit-Trail** | ✅ | JSONL Format, Request Tracking |
| **Validierung & Security** | ✅ | XSS-Protection, Input-Sanitization |

---

## 🚀 Quick Start

### Voraussetzungen
- Docker & Docker Compose (mindestens v2.0)
- Windows/Linux/Mac
- 4GB RAM minimum

### Installation & Start

```bash
# 1. Repository klonen
git clone https://github.com/X3S2/Audit-Tool.git
cd Audit-Tool

# 2. Docker starten
cd audittool
docker-compose up -d

# 3. Im Browser öffnen
# Frontend: http://localhost:4714
# Backend API: http://localhost:5050/api/health
# PostgreSQL: localhost:5432
```

### Standard Login
- **Benutzername**: `admin`
- **Passwort**: `AuditTool!2026`

⚠️ **WICHTIG**: Passwort in Produktion ändern!

---

## 🏗️ Architektur

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (http://localhost:4714)      │
│                  React + TypeScript Frontend             │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP/JSON
                           ↓
┌─────────────────────────────────────────────────────────┐
│              ASP.NET Core Backend API (Port 5050)       │
│  • JWT Authentication (8h)  • Token Refresh (7d)        │
│  • Error Handling            • Request Logging           │
│  • Circuit Breaker           • Input Validation          │
│  • Backup Scheduler          • Audit Trail               │
└──────────────────────────┬──────────────────────────────┘
                           │ Connection String
                           ↓
┌─────────────────────────────────────────────────────────┐
│       PostgreSQL Database (Port 5432)                   │
│  • Users, Audits, Locations, Rooms, Objects             │
│  • Checklists, App State, Backup Config                 │
└─────────────────────────────────────────────────────────┘
```

### 📁 Projektstruktur

```
Audit-Multi/
├── frontend/                 # React + Vite
│   ├── src/
│   │   ├── App.tsx           # Hauptkomponente
│   │   ├── App.css           # CSS Variables
│   │   ├── theme.css         # Dark/Light Mode
│   │   ├── ErrorBoundary.tsx # Error Handling
│   │   ├── InputValidator.ts # Validation
│   │   └── RetryableHttpClient.ts # Retry Logic
│   ├── index.html            # "Audit-Tool" Browser Title
│   └── package.json
│
├── backend/                  # ASP.NET Core
│   ├── Program.cs            # Zentrale Konfiguration
│   ├── BackupScheduleStore.cs # Zeitplan-Persistierung
│   ├── BackupService.cs      # Automatische Ausführung
│   ├── RefreshTokenStore.cs  # Token Management
│   ├── GlobalExceptionHandler.cs # Error Handling
│   ├── CircuitBreakerMiddleware.cs # Resilience
│   ├── AuditLogger.cs        # Audit Trail
│   ├── InputValidator.cs     # Validierung
│   ├── RequestLoggingMiddleware.cs # Request Logging
│   └── DatabaseMigrationService.cs # PostgreSQL Migration
│
├── audittool/                # Docker Orchestration
│   ├── docker-compose.yml    # 3 Services (Frontend, Backend, PostgreSQL)
│   ├── Dockerfile.frontend   # Nginx Build
│   └── Dockerfile.backend    # .NET Build
│
├── README.md                 # Dieses Dokument
├── CHANGELOG.md              # Versionshistorie
├── MASTERPLAN.md             # Detaillierte Implementierung
└── verify.sh                 # Production Verification Script
```

---

## 🔐 Sicherheit

### Authentifizierung
- **JWT Token**: 8 Stunden Gültigkeitsdauer
- **Refresh Token**: 7 Tage, automatische Rotation
- **Session**: Automatischer Logout nach 8h
- **Password Policy**: Mindestens 8 Zeichen, Großbuchstaben, Kleinbuchstaben, Ziffer

### Schutzmaßnahmen
- ✅ XSS-Protection durch HTML-Encoding
- ✅ Input-Sanitization gegen Script-Injections
- ✅ Payload-Size-Limits (10MB max)
- ✅ Circuit Breaker bei Überlast
- ✅ Retry-Logic mit Exponential Backoff

### Audit & Logging
- 📝 Alle Admin-Aktionen geloggt (JSONL)
- 📝 Error-Logs mit Stack-Traces
- 📝 Request-Tracking mit IP-Adresse
- 📝 Benutzer-ID in allen Logs

---

## 📊 Versionshistorie

### v1.6.0 - Validierung & Security (Aktuell)
- Input Validation (Frontend + Backend)
- XSS-Protection & Sanitization
- Passwort-Anforderungen
- Payload-Size-Limits

### v1.5.0 - Logging & Diagnostics
- AuditLogger für Action-Tracking
- RequestLoggingMiddleware
- JSONL-basierte Logs

### v1.4.0 - Resilience Patterns
- CircuitBreakerMiddleware
- RetryableHttpClient
- Exponential Backoff

### v1.3.0 - Error Handling
- React ErrorBoundary
- GlobalExceptionHandler
- Strukturierte Error-Responses

### v1.2.0 - Token-Refresh
- RefreshTokenStore
- POST /api/auth/refresh
- Sliding-Window Rotation

### v1.1.0 - PostgreSQL Migration
- DatabaseMigrationService
- SQLite → PostgreSQL
- Schema mit Foreign Keys

### v1.0.1 - Automatische Backup-Ausführung
- BackupService (BackgroundService)
- Zeitplan-basierte Execution
- Automatische Cleanup

### v1.0.0 - Backup-Zeitplanung ⭐
- BackupSchedule Model
- Admin-UI für Konfiguration
- Wochentag-Auswahl, Uhrzeit-Input

### v0.9.0 - v0.0.0
- Image-Management, Dark/Light Mode, PDF-Export, Backup/Restore, Auth

[Siehe CHANGELOG.md für Details](./CHANGELOG.md)

---

## 🔧 API Endpunkte (Auszug)

### Authentifizierung
```bash
POST   /api/auth/login              # Login → Token + RefreshToken
POST   /api/auth/refresh            # Token erneuern
GET    /api/auth/me                 # Aktiver Benutzer
```

### Admin
```bash
GET    /api/admin/users             # User-Liste
POST   /api/admin/users             # Benutzer erstellen
PUT    /api/admin/backup-schedule   # Backup-Zeitplan setzen
GET    /api/admin/backup-schedule   # Backup-Zeitplan abrufen
POST   /api/admin/backup            # Manuelles Backup
```

### Audit Management
```bash
GET    /api/audits                  # Alle Audits
POST   /api/audits                  # Audit erstellen
PUT    /api/audits/{id}             # Audit aktualisieren
DELETE /api/audits/{id}             # Audit löschen
```

### Image Management
```bash
POST   /api/objects/{id}/images     # Bild hochladen
GET    /api/objects/{id}/images     # Bilder abrufen
DELETE /api/objects/{id}/images/{name} # Bild löschen
```

[Vollständige OpenAPI Docs unter `/api/docs` (v1.7.0+)](./CHANGELOG.md)

---

## 🐳 Docker Services

| Service | Port | Bild | Container |
|---------|------|------|-----------|
| **Frontend** | 4714 | audittool-audit-frontend | audittool-frontend-ui |
| **Backend API** | 5050 | audittool-audit-backend | audittool-backend-api |
| **PostgreSQL** | 5432 | postgres:16-alpine | audittool-postgres-db |

### Volume
- `audittool_audit_postgres_data` - PostgreSQL Daten (persistent)

### Umgebungsvariablen (.env)
```bash
POSTGRES_DB=audittool
POSTGRES_USER=audittool
POSTGRES_PASSWORD=AuditTool!2026
JWT_KEY=AuditTool-Dev-Key-Change-me-in-production-1234567890
JWT_ISSUER=audit-tool
JWT_AUDIENCE=audit-tool-clients
```

---

## 🚦 Status & Monitoring

### Health Check
```bash
curl http://localhost:5050/api/health
# Response:
# {
#   "status": "ok",
#   "application": "audit-tool",
#   "timestampUtc": "2026-10-09T...",
#   "sessionTimeoutHours": 8
# }
```

### Logs ansehen
```bash
# Backend
docker logs audittool-backend-api -f

# Frontend
docker logs audittool-frontend-ui -f

# PostgreSQL
docker logs audittool-postgres-db -f
```

### Audit-Logs (Backend)
```bash
# Audit Trail (alle Admin-Aktionen)
docker exec audittool-backend-api cat /app/storage/audit_logs.jsonl

# Error Log (alle Fehler)
docker exec audittool-backend-api cat /app/storage/error_logs.jsonl
```

---

## 🔨 Entwicklung

### Frontend bauen
```bash
cd frontend
npm install
npm run dev        # Development Server (Port 5173)
npm run build      # Production Build
npm run lint       # TypeScript Check
```

### Backend bauen
```bash
cd backend
dotnet restore
dotnet build
dotnet run         # Development Server (Port 5000)
```

### Lokal testen (ohne Docker)
```bash
# Terminal 1: Backend
cd backend && dotnet run

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: PostgreSQL (Docker)
docker run -d -p 5432:5432 \
  -e POSTGRES_PASSWORD=AuditTool!2026 \
  postgres:16-alpine
```

---

## 📈 Performance

### Frontend
- **Bundle Size**: 253.63 KB (gzip: 75.96 KB)
- **Build Time**: ~124ms (Vite)
- **First Contentful Paint**: ~1.2s
- **Dark/Light Mode**: 0.3s CSS Transition

### Backend
- **Response Time**: <200ms (median)
- **Circuit Breaker Timeout**: 30s
- **Retry Backoff**: 1s → 2s → 4s → 8s → 10s max
- **Backup Job**: Alle 60 Sekunden

### Database
- **Queries**: Indiziert auf Audit-ID, User-ID
- **Connection Pool**: 20 connections (PostgreSQL)
- **Backup Size**: ~500KB pro Backup (SQLite)
- **Rotation**: Automatisch nach konfigurierten Max Backups

---

## 🐛 Troubleshooting

### Frontend lädt nicht?
```bash
# 1. Container-Logs checken
docker logs audittool-frontend-ui

# 2. Browser Cache leeren
# 3. F12 → Application → Clear All

# 4. Container neu starten
docker restart audittool-frontend-ui
```

### Backend antwortet nicht?
```bash
# 1. Backend-Status checken
curl http://localhost:5050/api/health

# 2. Logs ansehen
docker logs audittool-backend-api

# 3. Port-Konflikt?
netstat -an | find "5050"

# 4. Container neu starten
docker restart audittool-backend-api
```

### PostgreSQL Verbindungsfehler?
```bash
# 1. Datenbank läuft?
docker ps --filter "name=audittool-postgres"

# 2. Connection String prüfen
# Host=audittool-postgres; (Docker DNS)

# 3. Logs ansehen
docker logs audittool-postgres-db

# 4. Volume-Daten löschen (⚠️ Datenverlust!)
docker-compose down -v
docker-compose up -d
```

### Docker Build schlägt fehl?
```bash
# 1. Cache leeren
docker system prune -a

# 2. Neu bauen
cd audittool
docker-compose build --no-cache

# 3. Fehler prüfen
docker-compose build 2>&1 | tail -50
```

---

## 📚 Weitere Dokumentation

- **[CHANGELOG.md](./CHANGELOG.md)** - Detaillierte Versionhistorie für jedes v0.x / v1.x Release
- **[MASTERPLAN.md](./MASTERPLAN.md)** - Tiefgreifende Implementierungsdetails (Architektur, Code-Beispiele)
- **[verify.sh](./verify.sh)** - Production Verification Script

---

## 🤝 Contributing

Contributions sind willkommen! Bitte:
1. Feature Branch erstellen (`git checkout -b feature/xyz`)
2. Commits mit aussagekräftigen Meldungen (`git commit -m "v1.7.0: Feature XYZ"`)
3. Changelog & README aktualisieren
4. Docker Build & Test (`docker-compose build && docker-compose up -d`)
5. Pull Request erstellen

---

## 📄 Lizenz

Proprietär. Audit-Tool ist ein geschlossenes Projekt.

---

## 👥 Support

**Kontakt**: [support@example.com](mailto:support@example.com)  
**Issues**: [GitHub Issues](https://github.com/X3S2/Audit-Tool/issues)  
**Dokumentation**: [Wiki](https://github.com/X3S2/Audit-Tool/wiki)

---

**Version**: 1.6.0  
**Datum**: 2026-10-09  
**Status**: ✅ **PRODUKTIONSREIF**

🚀 **Audit-Tool ist ready for Production!**
