# 🎯 Audit-Tool v1.7.8 – Professionelles Audit-Management

**Enterprise-Ready | Deutsch | React + TypeScript + ASP.NET Core + PostgreSQL | Docker**

---

## 📋 Überblick

**Audit-Tool** ist eine professionelle, deutschsprachige Web-Anwendung zur Verwaltung von Audits, Standorten, Räumen, Objekten, Bildern und Checklisten. Das System bietet vollständiges Account-Management, PDF-Designer, Checklisten, Datenbankbackups und ein sicheres Token-basiertes Authentifizierungssystem.

### 🎯 Kernfunktionen (v1.7.8)

| Feature | Status |
|---------|--------|
| **Authentifizierung & Sessions** | ✅ 8h Timeout, Case-Insensitive Login |
| **Benutzerverwaltung** | ✅ Anlegen, Bearbeiten, Passwort-Reset, Rollen |
| **Audit Management** | ✅ Hierarchisch: Kategorie → Standort → Raum |
| **Template-basierte Räume** | ✅ Felder aus Vorlage (scope: Räume/Grunddaten) |
| **Grunddaten-Felder** | ✅ Vorlage definiert scope:site Felder, erfassbar im Grunddaten-Tab |
| **Raumliste als Tabelle** | ✅ Kompakte Tabellenansicht mit Bilderbutton |
| **Bildverwaltung** | ✅ Upload in Feldwerte (Base64/||), Galerie-Modal mit Zoom |
| **Backup & Restore** | ✅ Manuell, Zeitplan, Download, Upload, persistentes Volume |
| **PDF Designer** | ✅ WYSIWYG, Mehrseiter, Drag & Drop, Variablen |
| **Persistenz** | ✅ Docker Volume audit_storage_data – kein Datenverlust nach Rebuild |
| **Checklisten-Designer** | ✅ Spalten definieren, Live-Sync vorbereitet |
| **Dark/Light Mode** | ✅ Per-User, CSS-Variablen |
| **Logging & Audit-Trail** | ✅ CRUD-Aktionen geloggt (Kategorien, Standorte, Räume, Vorlagen) |
| **System-Logs** | ✅ Filterbar nach Aktion, Benutzer, Details |
| **Datenexport** | ✅ ZIP per Standort oder Gesamtexport |
| **Mobile Design** | ✅ Responsive Header, Hamburger-Menu |

---

## 🚀 Quick Start

### Voraussetzungen
- Docker & Docker Compose (mindestens v2.0)
- Windows / Linux / macOS
- 4 GB RAM minimum

### Installation & Start

```bash
# 1. Repository klonen
git clone https://github.com/X3S2/Audit-Tool.git
cd Audit-Tool/audittool

# 2. Docker starten
docker-compose up -d

# 3. Im Browser öffnen
# Frontend: http://localhost:4714
# Backend:  http://localhost:5050/api/health
```

### Standard-Zugangsdaten

| Benutzer | Passwort | Rolle |
|----------|----------|-------|
| `superadmin` | `AuditTool!2026` | Superadmin |
| `admin` | `AuditTool!2026` | Admin |
| `user` | `Password123!` | Benutzer |
| `azubi` | `Password123!` | Azubi |

> ⚠️ **Bitte Passwörter in der Produktion ändern!**

---

## 🏗️ Architektur

```
Browser (localhost:4714)
  React + TypeScript + Vite
        │ HTTP/JSON
        ▼
ASP.NET Core API (localhost:5050)
  • JWT Auth (8h)   • Token Refresh (7d)
  • CORS            • Request Logging
  • Circuit Breaker • Input Validation
        │
        ▼
PostgreSQL (localhost:5432)
  Datenspeicherung via SQLite-Fallback
```

---

## 📁 Projektstruktur

```
Audit-Multi/
├── audittool/          # Docker Compose
│   └── docker-compose.yml
├── backend/            # ASP.NET Core API (C#)
│   └── Program.cs
├── frontend/           # React + TypeScript
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── Navigation.tsx
│       │   ├── PdfDesignerCanvas.tsx
│       │   └── ...
│       └── App.css
├── storage/            # Daten, Backups, Uploads
└── CHANGELOG.md
```

---

## 🔄 Docker Rebuild

```bash
cd audittool
docker-compose down
docker-compose up -d --build
```

---

## 📝 Versionshistorie

Alle Änderungen sind im [CHANGELOG.md](CHANGELOG.md) dokumentiert.

**Aktuelle Version:** v1.7.8