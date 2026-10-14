# Architektur-Übersicht

## Überblick
- Frontend: React + TypeScript + Vite
- Backend: ASP.NET Core Web API
- Datenbank: SQLite (`storage/audit-tool.db`, WAL-Modus für gleichzeitige Mehrbenutzerzugriffe); ein PostgreSQL-Dienst ist in `docker-compose.yml` als Option für eine mögliche spätere Migration vorhanden, wird vom Backend aktuell aber nicht angesprochen
- Medien (Bilder): als echte Dateien unter `storage/media/` (nicht mehr als Base64 im JSON-Feldwert)
- Auth: JWT mit 8-Stunden-Laufzeit
- Container: Docker Compose

## Kernprinzipien
- Rolle-basierte Zugriffskontrolle
- Session-Timeout mit erneuter Anmeldung nach Ablauf
- Mobiloptimierte Weboberfläche mit Dark-/Whitemode
- Datenbank- und Datei-Storage als zentrale Basis
- Lazy Loading: Standortliste liefert nur eine schlanke Übersicht, Details (Räume, Dokumente) werden erst beim Öffnen eines Standorts/Audits nachgeladen
- Backups als konsistente SQLite-Snapshots (`VACUUM INTO`); beim Restore werden gepoolte Verbindungen verworfen und veraltete WAL-Begleitdateien (`-wal`/`-shm`) entfernt, bevor der WAL-Modus neu aktiviert wird
