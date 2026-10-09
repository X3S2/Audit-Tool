# Masterplan Audit-Tool

## Projektziel
Das Audit-Tool wird als deutschsprachige Webapplikation entwickelt, die Standorte, Kategorien, Räume, Objekte, Bilder, Checklisten, Audits, Benutzermanagement, PDF-Exporte, ZIP-Downloads, Backups und Docker-Deployment in einer ersten produktiven Kernversion abbildet. Die Architektur basiert auf React + TypeScript im Frontend, ASP.NET Core im Backend und PostgreSQL als langfristige Datenbank mit Docker-Containerisierung.

## Grundprinzipien
- Kommunikation und UI vollständig auf Deutsch.
- Umlaute, Sonderzeichen und Exportnamen korrekt berücksichtigen.
- Erste produktive Version startet bei Version 0.0.0 und enthält die Kernfunktionen.
- Jeder größere Fortschritt wird mit Changelog, Versionierung und ggf. Git-Commit begleitet.
- Authentifizierung ist auf 8 Stunden begrenzt; nach Ablauf muss sich der Nutzer beim nächsten Zugriff erneut anmelden.
- Rollenmodell: Superadmin, Admin, Benutzer, Azubi.
- Ziel ist ein sauberer, erweiterbarer Baukasten, nicht „Big-Bang“-Entwicklung ohne Basis.

## Architektur- und Technologierahmen
- Frontend: React + Vite + TypeScript
- Backend: ASP.NET Core Web API
- DB: PostgreSQL als Produktivziel, zunächst als persistente Struktur mit späteren Migraionen
- Container: Docker Compose mit eindeutig benannten Services
- Deployment: lokales Docker-Setup und spätere Synology-NAS-Portierung
- Security: JWT mit 8h-Laufzeit, Rollenautorisation, sichere CORS- und Header-Policy

## Versionierungsstrategie
- 0.0.0: Basis und Kernfunktionen
- 0.1.0: Rollen + Admin-Flows + Standorte + Templates
- 0.2.0: Räume, Objekte, Audits und Checklisten
- 0.3.0: Bilder, Upload-Handling, PDF-Exporte
- 0.4.0: ZIP-Export, Datensicherung und Restore
- 0.5.0: Docker- und Deployment-Härtung
- 1.0.0: Erste stabile Produktivversion

## Master-Phasen

### Phase 0 – Projektstart und Baseline
Ziel: Projekt aufsetzen, Rahmen definieren und sichere Basis schaffen.

Schritte:
- Repository vorbereiten und Strukturen anlegen
- README und .gitignore erstellen
- Basis-Architektur festlegen
- Docker-Struktur mit eigenständigen Namen definieren
- Backend- und Frontend-Initialisierung
- Changelog initialisieren
- Planungsdokumente ergänzen

Ergebnis:
- saubere Basis mit dokumentiertem Projektzustand

### Phase 1 – Sicherheitsbasis und Authentifizierung
Ziel: sichere Anmeldung, Rollenmodell, 8-Stunden-Sitzung.

Schritte:
- JWT-Token-Konfiguration definieren
- Login-Endpunkt und Token-Ausgabe vorbereiten
- Session-Expiry auf 8 Stunden setzen
- Frontend-Login-Lifecycle für automatische Abmeldung
- Protected Routes und Rollenprüfung in API und UI
- Seed-Accounts für Superadmin, Admin, Benutzer, Azubi
- Auth-Profile und Dashboard-Zugriff

Ergebnis:
- sichere, getestete Anmeldefunktion mit Session-Timeout

### Phase 2 – Basisdatenmodelle
Ziel: Konfigurationen und Stammdaten für Betrieb vorbereiten.

Schritte:
- Kategorien modellieren
- Standorte modellieren
- Templates mit Feldern definieren
- Beispiel-Daten für Entwicklung anlegen
- CRUD-Endpunkte für Kategorien, Standorte, Templates
- UI für Listen und Formulare ergänzen

Ergebnis:
- verwaltbare Plattform und strukturierte Datenbasis

### Phase 3 – Räume und Objekte
Ziel: Audit-Objekte in der Praxis modellieren.

Schritte:
- Raum-Erfassung für Standorte
- Objekt-Erfassung im Raum
- Status- und Zustandsfelder definieren
- Listenansicht und Detailansicht ergänzen
- Raum-/Objekt-Zuordnung und Sichtbarkeit prüfen

Ergebnis:
- alle organisatorischen Bausteine eines Audits sind nutzbar

### Phase 4 – Audit-Workflow
Ziel: Erstellung, Bearbeitung und Abschluss von Audits.

Schritte:
- Audit-Instanz erstellen
- Vorlage mit Audit verknüpfen
- Checklisten- und Bewertungsfrage eintragen
- Statusverwaltung definieren
- Fortschrittsberechnung ergänzen
- Audit-Details und Historie anzeigen

Ergebnis:
- komplette Audit-Lebenszyklus-Logik ist in den Kernfunktionen verfügbar

### Phase 5 – Bilder und Medien
Ziel: Eingabe und Verwaltung von Belegen.

Schritte:
- Bild-Upload für Standort, Raum, Objekt und Audit
- Größenbegrenzung und Komprimierung definieren
- Dateinamenskonventionen festlegen
- Metadaten wie Datum, Benutzer, Ort speichern
- Bild- und Datei-Management im Admin-/Audit-Bereich

Ergebnis:
- Medien können zuverlässig dokumentiert und exportiert werden

### Phase 6 – PDF-Export
Ziel: Audit-Berichte als PDF ausgeben.

Schritte:
- Report-Template definieren
- Zusammenfassung von Audit, Daten, Bildern und Notizen erstellen
- Layout für Dark-/Light-Export vorbereiten
- Exportfunktion im UI verbinden
- PDF-Qualität und Dateinamen prüfen

Ergebnis:
- ein Audit kann als verständlicher Bericht exportiert werden

### Phase 7 – ZIP-Export und Datenexport
Ziel: komplette Datenbereitstellung pro Standort oder gesamt.

Schritte:
- Ordnerstruktur festlegen: Kategorie > Standort > Raum > Objekt > Bilder
- Export-Workflow implementieren
- ZIP-Generation und Download sichern
- Metadaten und Originalgrößen definieren
- Export- und Download-Checks erweitern

Ergebnis:
- vollständige, nachvollziehbare Datenexporte stehen zur Verfügung

### Phase 8 – Backup/Restore und Admin-Tools
Ziel: Datensicherung, Wiederherstellung und Administration.

Schritte:
- Backup-Planung und Strategie definieren
- Manuelle Vollbackups erstellen
- Wiederherstellungslogik einbauen
- Automatische Backups mit Rotation konfigurieren
- Backup-Listen mit Aktionen „Sichern“, „Wiederherstellen“, „Löschen“
- Admin-Schutz für kritische Daten und Nutzerrechte

Ergebnis:
- Datensicherheit und Wiederherstellung sind produktionsnah umgesetzt

### Phase 9 – Docker und Deployment
Ziel: Anwendung im Container sauber starten.

Schritte:
- Compose-Dateien finalisieren
- eindeutige Container- und Service-Namen definieren
- Umgebungsvariablen und Secrets vorbereiten
- Healthchecks ergänzen
- Docker-Builds automatisieren
- lokale und NAS-Deployment validieren

Ergebnis:
- System kann konsistent in Docker laufen

### Phase 10 – Qualität, Stabilität und Release
Ziel: Produktive Reife und Kontrolle.

Schritte:
- Backend-/Frontend-Builds prüfen
- Sicherheitschecks und Login-Tests durchlaufen
- API-Fehler und Randfälle prüfen
- Changelog und README aktualisieren
- GitHub-Release-Workflow vorbereiten
- Finalen Release-Check durchführen

Ergebnis:
- erste stabile Version mit nachvollziehbarem Qualitätsstand

## Kernfunktionen der 0.0.0-Version
Die erste produktive Version umfasst zwingend:
- Login/Logout mit 8h-Sitzungszeit
- Rollenmodell und Admin-/User-Mechanik
- Kategorien verwalten
- Standorte verwalten
- Vorlagen verwalten
- Räume und Objekte erfassen
- Audit-Instanzen anlegen und bearbeiten
- Checklisten und Einträge erfassen
- Dashboard mit Überblick
- Profilverwaltung mit Theme- und Passworteinstellungen
- Docker-Basis für lokale Ausführung

## Entwicklungsvorgaben pro Meilenstein
Für jeden größeren Schritt gilt:
- Code in kleine, überprüfbare Einheiten zerlegen
- Backend und Frontend direkt mitlaufen lassen
- Changelog anpassen
- Version korrekt erhöhen
- Git-Push nach abgeschlossener Teilfunktion
- README und Projekt-Checkliste aktualisieren

## Risiken und Gegenmaßnahmen
- Rollen- und Auth-Funktionen verfeinern, um Missbrauch und unberechtigten Zugriff zu verhindern
- Login-Timeout strikt umsetzen und im Frontend/Backend konsistent prüfen
- Datensicherung früh mitdenken, damit spätere Features nicht unvollständig werden
- Bilder- und Export-Workflows müssen früh auf Größen- und Speicherlimits abgestimmt werden
- Deployment auf NAS und Docker muss einfach portierbar bleiben

## Abschlusskriterien
Die erste Produktivversion gilt als abgeschlossen, wenn:
- Login mit 8-Stunden-Timeout stabil funktioniert
- Admin- und Benutzerrollen korrekt greifen
- Kategorien, Standorte, Templates, Räume, Objekte und Audits nutzbar sind
- Backup- und Export-Mechanik vorbereitet sind
- Docker-Start und lokale Ausführung funktionieren
- Changelog und README den aktuellen Zustand korrekt dokumentieren

## Nächste konkrete Arbeitsschritte
1. Basisdatenmodelle für Räume, Objekte und Audits erweitern
2. Frontend für Audit-Overview, Formularfelder und Statusanzeige ergänzen
3. Checklisten-Logik und Statusabschnitte umsetzen
4. Bild-Upload-/Kompressions-Design vorbereiten
5. Export- und Backup-Module in die Architektur aufnehmen
6. Release- und Docker-Härtung abschließen
