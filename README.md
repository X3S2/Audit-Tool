# Audit-Tool

Ein deutschsprachiges Audit-Tool für Standorte, Räume, Objekte, Bilder, Checklisten und PDF-Exporte.

## Projektstatus
- **Stack**: React + TypeScript + ASP.NET Core + SQLite + iText7 für PDF-Export
- **Status**: ✅ Kernfunktionen produktionsreif (v0.7.0+)
- **Login-Timeout**: 8 Stunden mit automatischer Abmeldung
- **Ports**: 4714 Produktiv, 5050 API (Lokal), 5173/5174 Frontend (Lokal mit Fallback)
- **Datenbank**: SQLite mit persistenter JSON-Serialisierung
- **Aktuelle Version**: 0.7.0 (Frontend-Image-Gallery für Objekte)

## Schnellstart

### Voraussetzungen
- .NET SDK 10+
- Node.js 22+
- Docker Desktop oder Docker Engine (optional für Produktiv-Einsatz)

### Lokale Entwicklung
1. **Backend starten** (Terminal 1):
   ```bash
   cd backend
   dotnet run --urls http://localhost:5050
   ```

2. **Frontend starten** (Terminal 2):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Browser öffnen**:
   - Frontend: http://localhost:5173 (oder nächster verfügbarer Port)
   - Backend API: http://localhost:5050

### Docker-Start (Produktiv)
```bash
docker compose -f docker/docker-compose.yml up --build
```
Produktions-URL: http://localhost:4714

## Standard-Test-Accounts
| Benutzer    | Passwort      | Rolle        |
|-------------|---------------|--------------|
| superadmin  | Password123!  | Superadmin   |
| admin       | Password123!  | Admin        |
| user        | Password123!  | Benutzer     |
| azubi       | Password123!  | Azubi        |

## Implementierte Kernfunktionen

### 🔐 Sicherheit & Authentifizierung
- JWT-basierte Authentifizierung mit 8-Stunden-Session-Timeout
- Rollenbasierte Zugriffskontrolle (RBAC): Superadmin > Admin > Benutzer > Azubi
- Sichere Passwort-Verwaltung mit Verifizierung
- Automatische Session-Abmeldung nach Timeout

### 👥 User-Management (Admin-Panel)
- Benutzer erstellen, bearbeiten, aktivieren/deaktivieren, löschen
- Passwort-Reset durch Admin (nur für Benutzer unter ihrer Rolle)
- Passwort-Änderung durch Benutzer selbst im Profil-Panel
- Rollenverteilung mit Sicherheitsregeln (Admin kann Superadmin nicht ändern)

### 📍 Audit-Management
- Hierarchische Struktur: Kategorien → Standorte → Räume → Objekte
- Audit-Instanzen mit Checklisten erstellen und verwalten
- Audit-Status-Tracking (Entwurf, In Bearbeitung, Erfasst, Abgeschlossen)
- Checklist-Einträge mit Frage/Antwort und Status

### 📋 Vorlagen & Konfiguration
- Audit-Vorlagen mit dynamischen Feldern definieren
- Feldtypen: Text, Dropdown, Textarea
- Templates für wiederholbare Audit-Prozesse
- Kategorien und Standorte verwalten

### 📊 Berichte & Exporte
- **PDF-Export**: Audit-Reports als PDF-Dateien generieren (iText7)
- **ZIP-Export**: Hierarchische Datenexporte mit Bilder, Metadaten und Manifest
- **Backup-Management**: Manuelle Backups erstellen, wiederherstellen, löschen
- **Automatische Backup-Rotation**: Max. 10 Backups, älteste werden automatisch gelöscht

### 🖼️ Bilder & Medien (Vorbereitet)
- **Komprimierungs-Modul**: JavaScript-basierte Bild-Komprimierung vor Upload
- Größenlimit: 5MB pro Datei
- Adaptive Qualitätsanpassung bei Bedarf
- Zeitstempel-basierte Dateinamenskonvention

### 📱 Benutzerober oberfläche
- **Dark/Light-Mode**: Benutzer-Präferenz mit Persistent-Storage
- **Responsive Design**: Für Desktop und Tablet optimiert (Mobile-Optimierung folgt)
- **Mehrsprachig**: Vollständig deutschsprachig mit Umlauten
- **Fehlerbehandlung**: Aussagekräftige Fehlermeldungen auf Deutsch

### 💾 Datenmanagement
- SQLite-Persistierung für alle Daten (Nutzer, Audits, Konfiguration)
- JSON-basierte Datenserialisierung in der DB
- Datenintegrität durch SQLite-ACID-Eigenschaften
- Keine Datenverluste bei Neustart

## Versionshistorie

| Version | Datum | Features |
|---------|-------|----------|
| 0.7.0   | 2026-10-09 | Frontend-Image-Gallery für Objektbilder |
| 0.6.0   | 2026-10-09 | Image-Download-Endpunkt, Backend-APIs für Bildverwaltung |
| 0.5.0   | 2026-10-09 | Bild-Komprimierungs-Module, Image-Foundation |
| 0.4.0   | 2026-10-09 | Automatische Backup-Rotation (Max. 10 Backups) |
| 0.3.0   | 2026-10-09 | Profil-Seite, User-Passwortänderung |
| 0.2.1   | 2026-10-09 | PDF-Export für Audits (iText7 + Bouncy Castle) |
| 0.2.0   | 2026-10-09 | Admin-User-Management (Reset, Toggle, Delete) |
| 0.1.2   | 2026-10-09 | SQLite-Persistierung für alle Datenmodelle |
| 0.1.1   | 2026-10-09 | Stabilisierung Bild-Upload-API |
| 0.1.0   | 2026-10-09 | Backup-Management, ZIP-Export, Admin-Panel |
| 0.0.0   | 2026-10-09 | Basis-Projekt, Login, Rollenmodell, Dashboard |

Siehe [CHANGELOG.md](./CHANGELOG.md) für Details.

## Git-Push-Checkliste
Vor jedem GitPush muss die folgende Liste abgearbeitet sein:

- [ ] README geprüft und aktualisiert
- [ ] CHANGELOG aktualisiert (Keep-a-Changelog-Format auf Deutsch)
- [ ] Versionierung angepasst (SemVer: major.minor.patch)
- [ ] Backend kompiliert ohne Fehler (`dotnet build`)
- [ ] Frontend TypeScript kompiliert und buildet ohne Fehler (`npm run build`)
- [ ] SQLite-Persistenz für Kernfunktionen validiert
- [ ] Login- und Session-Timeout (8h) geprüft
- [ ] Rollenzugriff getestet
- [ ] Admin-User-Management-Endpunkte verifiziert
- [ ] PDF-Export für Audits getestet
- [ ] Backup-Management und Rotation getestet
- [ ] Datenintegrität nach Neustart überprüft
- [ ] Docker Compose validiert (falls Änderungen)
- [ ] Keine unkompilierten TypeScript/C#-Fehler
- [ ] Keine offenen kritischen Fehler in den Kernflows

## Projektstruktur
```
Audit-Tool/
├── backend/
│   ├── Program.cs (Zentrale API-Endpunkte, Datenmodelle, SQLite-DB)
│   ├── backend.csproj (NuGet: itext7, bouncy-castle-adapter, SQLite, JWT)
│   └── bin/Debug/net10.0/ (Kompilierte Binaries)
├── frontend/
│   ├── src/
│   │   ├── App.tsx (Zentrale React-Komponente mit allen UI-Flows)
│   │   ├── App.css (Styling für Dark/Light-Mode)
│   │   └── imageCompression.ts (Bild-Komprimierungs-Modul)
│   ├── package.json (npm-Dependencies)
│   └── dist/ (Produktiv-Build)
├── docker/
│   ├── docker-compose.yml (Service-Orchestrierung)
│   └── Dockerfile.* (Container-Definitionen)
├── storage/
│   ├── audit-tool.db (SQLite-Datenbank, .gitignore)
│   ├── backups/ (Backup-Zip-Dateien)
│   ├── exports/ (Export-Zip-Dateien)
│   └── uploads/ (Objektbilder, organisiert nach ObjectId)
├── docs/ (Dokumentation)
├── README.md (Dieses Dokument)
├── CHANGELOG.md (Versionshistorie mit Details)
├── .gitignore (Ausnahmen für Git)
├── plan.md (Ursprüngliche Anforderungen)
├── masterplan.md (Detaillierte Projektplanung)
└── .env.example (Umgebungsvariablen-Template)
```

## Wichtige Entwicklungsregeln
- ✅ Vollständig deutschsprachig (UI, Fehler, Dokumentation, Kommentare)
- ✅ Umlaute und Sonderzeichen in UI und Exporten korrekt behandelt
- ✅ Session-Timeout 8 Stunden (JWT auf Backend, Storage-Clear auf Frontend)
- ✅ Docker-Container eindeutig benannt
- ✅ Nach größeren Features Changelog und Versionierung aktualisieren (SemVer)
- ✅ Keine Secrets im Repository hinterlegen (.env in .gitignore)
- ✅ SQLite-Datenbankdatei wird nicht committed (storage/audit-tool.db in .gitignore)
- ✅ Alle API-Endpunkte mit [Authorize] dekoriert, wo erforderlich
- ✅ Rollenprüfung auf Frontend und Backend konsistent

## Bekannte Einschränkungen & Roadmap

### MVP-Einschränkungen (Für 0.5.x geplant)
- **SQLite für MVP**: Produktions-NAS-Deployment auf PostgreSQL geplant (1.0.x)
- **Bild-Upload UI**: Backend-Endpunkte müssen noch hinzugefügt werden
- **Kein Token-Refresh**: Nach 8h muss Benutzer sich neu anmelden (1.0.x)
- **Backup-Restore prototypisch**: Nicht vollständig implementiert (1.0.x)
- **Mobile UI**: Noch nicht vollständig optimiert (1.1.x)

### Geplante Features (1.0.0+)
- [ ] Bild-Upload-Endpunkte im Backend
- [ ] Frontend-Bild-Upload-UI mit Komprimierung
- [ ] PostgreSQL-Migration für Produktiv-NAS
- [ ] Token-Refresh-Mechanik
- [ ] Backup-Restore vollständig implementieren
- [ ] Mobile-Design-Optimierung
- [ ] Automatische Backups nach Zeitplan
- [ ] Audit-Fortschrittsberechnung
- [ ] Export-Filter (nach Datum, Status, etc.)
- [ ] Mehrsprachiges UI (Englisch, etc.)

## Support & Kontakt
Projekt intern / proprietär - keine öffentliche Unterstützung.

## Lizenz
Projekt intern / proprietär. Alle Rechte vorbehalten.

---

**Version**: 0.6.0  
**Letztes Update**: 2026-10-09  
**Entwickler**: Copilot + Benutzer
