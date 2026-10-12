# Changelog

## [2.0.0] - 2026-10-12

### CDN-/NAS-Erreichbarkeit, PDF-Tabellen-Umbruch & Mobile-Feinschliff (fix008.md)

#### Fix: API über CloudRouter/CDN (z. B. Synology NAS, ipv64.net) nicht erreichbar
- Root Cause: Das Frontend hat die Backend-API bisher über eine fest hinterlegte Portnummer (`:5050`) direkt angesprochen (`window.location.hostname + ":5050"`). Sobald ein Reverse-Proxy/CDN/Router (wie CloudRouter) nur einen einzigen externen Port auf das Frontend weiterleitet, war die API dadurch von außen grundsätzlich nicht erreichbar — unabhängig von CORS-Einstellungen (die bereits korrekt konfiguriert waren)
- Das Frontend ruft die API jetzt ausschließlich über relative, same-origin Pfade auf (`/api/...`) statt über einen fest einprogrammierten Host/Port
- Neuer nginx-Reverse-Proxy im Frontend-Container (`audittool/nginx.conf`): leitet alle `/api/`-Anfragen intern an den Backend-Container weiter, bevor sie den Browser überhaupt verlassen — es muss also nur noch **ein einziger externer Port** (der des Frontends) durch Router/CDN/CloudRouter weitergeleitet werden
- Vite-Dev-Server-Proxy ergänzt (`frontend/vite.config.ts`), damit `npm run dev` weiterhin lokal ohne Umwege funktioniert
- `docker-compose.yml` bereinigt (veraltetes `version:`-Attribut entfernt) und kommentiert: die Portfreigabe `5050:8080` des Backends ist jetzt rein optional (nur für direkte API-Diagnose), nicht mehr für den normalen Betrieb erforderlich
- Lokal end-to-end verifiziert: Login, CORS-Preflight und alle API-Aufrufe funktionieren vollständig über den Frontend-Port (same-origin), ohne dass der Browser Port 5050 direkt kontaktiert
- Hinweis: Die konkrete Erreichbarkeit über die individuelle CloudRouter-/ipv64.net-Konfiguration kann nur auf dem tatsächlichen NAS final geprüft werden — nach dem Deployment bitte erneut testen

#### Sicherheitslücken in NuGet-Abhängigkeiten geprüft und teilweise behoben
- `Microsoft.Data.Sqlite` von 10.0.0 auf 10.0.12 aktualisiert — behebt eine als **hoch** eingestufte Schwachstelle in der transitiven Abhängigkeit `SQLitePCLRaw.lib.e_sqlite3` (NU1903)
- `Microsoft.IdentityModel.Tokens` von 8.19.2 auf 8.23.0 aktualisiert (zusätzliches sicherheitsrelevantes Update ohne Breaking Changes)
- Die verbleibenden 3 als **mittel** eingestuften Warnungen (NU1902, `BouncyCastle.Cryptography` über `itext7.bouncy-castle-adapter`) wurden **bewusst nicht behoben**: Die einzige verfügbare Lösung wäre ein Sprung von iText7 8.0.5 direkt auf Version 9.x (keine Zwischenversion behebt die Abhängigkeit), was angesichts der umfangreichen PDF-Rendering-Codebasis ein hohes Risiko für Breaking Changes darstellt. Die betroffenen BouncyCastle-Funktionen (kryptografische Signaturen) werden von der PDF-Erzeugung dieser Anwendung nicht genutzt — das Restrisiko wird daher als vertretbar eingestuft und dokumentiert

#### PDF-Tabellen: Lange Kommentartexte wurden abgeschnitten statt umgebrochen
- Tabellenzellen mit langem Text (z. B. Kommentarspalten) zeigten bisher nur die ersten paar Wörter, der Rest wurde kommentarlos nicht gerendert
- Zellen brechen jetzt auf bis zu 2 Textzeilen um (Zeilenhöhe der Tabelle dafür von 20pt auf 30pt erhöht); passt der Text auch dann nicht vollständig, wird er anhand der tatsächlich gemessenen Textbreite der verwendeten Schriftart gekürzt und mit „…" gekennzeichnet, statt wortweise und ohne Hinweis abgeschnitten zu werden
- Die automatische Seitenumbruch-Logik der Tabelle bleibt unverändert

#### Mobile Galerie-Modal war oben und unten abgeschnitten
- Auf schmalen Bildschirmen (≤600px) füllte das Bild-Galerie-Modal die volle Viewport-Höhe (`100vh`) innerhalb eines zusätzlich gepolsterten Overlays — dadurch ragte es oben und unten über den sichtbaren Bereich hinaus
- Modal-Höhe auf Mobilgeräten auf `80vh` reduziert, Overlay-Padding auf `0` gesetzt — durch die vorhandene Flexbox-Zentrierung ergibt sich dadurch automatisch ein gleichmäßiger Abstand von ca. 10% der Viewport-Höhe oben und unten

#### Mobile Darstellung: „mehr Details…"-Kürzung jetzt noch kompakter
- Auf Mobilgeräten (≤768px) wird bei Werten über 20 Zeichen jetzt **ausschließlich** der „mehr Details…"-Link angezeigt (kein Textauszug mehr davor) — der vollständige Text bleibt über das bereits bestehende Detail-Modal (seit fix007.md) weiterhin vollständig einsehbar
- Die Desktop-Darstellung (Kürzung ab 60 Zeichen mit Textauszug) bleibt unverändert

### 🎉 Versionssprung auf 2.0.0
Mit Abschluss von fix008.md sind alle für den produktiven Einsatz als wichtig erachteten Kernfunktionen, Stabilitätsfixes und Deployment-Voraussetzungen (insbesondere die CDN-/Reverse-Proxy-Portabilität) umgesetzt — daher Versionssprung von 1.10.x auf **2.0.0** statt eines weiteren Patch-Releases.

## [1.10.4] - 2026-10-11

### Wiederholblock-Datenstand & lange Texte in Tabellen (fix007.md)

#### Fix: Wiederholblock im PDF-Designer zeigte nur den ersten Datensatz / iterierte nicht über alle Räume
- Root Cause gefunden: Beim Anlegen eines Audits wird der Raumbestand des Standorts einmalig als Schnappschuss eingefroren (damit spätere Live-Raum-Änderungen bereits erzeugte Audit-Dokumente nicht nachträglich verändern) — dieser Schnappschuss wurde aber **nie wieder aktualisiert**, selbst wenn danach neue Räume am Standort angelegt, bestehende bearbeitet oder gelöscht wurden. Dadurch hat der Wiederholblock zwar technisch korrekt über *alle Datensätze im Schnappschuss* iteriert, aber der Schnappschuss selbst enthielt veraltete/zu wenige Räume (z. B. nur 1 statt 3) — keine Fehlfunktion des PDF-Renderers, sondern veraltete Grunddaten
- Jeder eingefrorene Raum-Datensatz merkt sich jetzt (`OriginLiveRoomId`), aus welchem Live-Raum er ursprünglich erzeugt wurde
- Neuer automatischer Abgleich (`SyncAuditRoomSnapshot`), der unmittelbar vor jeder PDF-/Dokumentengenerierung eines laufenden Audits ausgeführt wird und den eingefrorenen Raumbestand mit dem aktuellen Live-Bestand des Standorts abgleicht: neu hinzugekommene Räume werden ergänzt, gelöschte Räume werden entfernt, bearbeitete Räume werden mit ihren aktuellen Feldwerten aktualisiert; bereits bestehende (ältere) Schnappschüsse werden dabei einmalig automatisch anhand des Raumnamens mit ihrem Live-Raum verknüpft
- Dadurch zeigen automatisch befüllte Tabellen und Wiederholblöcke im PDF jetzt immer den tatsächlich aktuellen Raumbestand des Standorts zum Zeitpunkt der Dokumentenerstellung
- Live verifiziert: Audit mit zuvor veraltetem 1-Raum-Schnappschuss zeigt nach erneuter Dokumentengenerierung korrekt alle 3 aktuell vorhandenen Räume (Tabelle: 3 Zeilen; Wiederholblock: 3 Seiten, je eine pro Raum)

#### Lange Texte in Tabellen werden jetzt gekürzt mit „mehr Details…“-Link
- Lange Textwerte in den Tabellen der Checklisten sowie der Räume/Objekte-Übersicht werden ab einer bestimmten Länge nicht mehr unformatiert in voller Länge angezeigt (was das Tabellenlayout gesprengt hat), sondern auf ca. 60 Zeichen gekürzt mit einem anklickbaren „mehr Details…“-Link
- Klick öffnet ein zentriertes Detail-Modal mit dem vollständigen Text (Raum- und Spaltenname als Titel, Schließen-Button)



### Daten-Refresh, Superadmin-Rollenverwaltung, Checkbox-Ausrichtung & PDF-Designer-Fixes (fix006.md)

#### Daten-Refresh nach eigenen Speicherungen
- Nach dem Anlegen, Bearbeiten oder Löschen eines Raums sowie nach dem Speichern der Grunddaten eines Standorts werden die Kerndaten jetzt automatisch neu geladen, statt nur den lokalen UI-Zustand zu aktualisieren — dadurch bleiben auch parallel arbeitende Nutzer/innen beim nächsten Seitenwechsel konsistent auf dem aktuellen Stand
- Zusätzlich zu den bereits bestehenden Refreshs beim Seitenwechsel und beim Betreten eines Standorts wird jetzt also auch nach jeder eigenen Speicherung aktualisiert

#### Fix: Superadmin konnte eigenes Passwort nicht zurücksetzen & Rolle „Superadmin" fehlte bei der Rollenzuweisung
- Der Passwort-Zurücksetzen-Dialog für Benutzer funktioniert jetzt zuverlässig auch für Superadmin-Konten
- Das Rollen-Dropdown beim Anlegen und Bearbeiten eines Benutzers zeigt jetzt korrekt alle vier Rollen inkl. „Superadmin" an (zuvor fehlte diese Option vollständig)
- Neuer Backend-Endpunkt `PUT /api/users/{userId}` zum Aktualisieren von Anzeigename und Rolle; Admin-Konten dürfen weiterhin keine Benutzer zu Superadmin befördern oder neue Superadmin-Konten anlegen (serverseitig abgesichert)

#### Fix: Checkbox-Datenfelder wurden über die gesamte Feldbreite gestreckt angezeigt
- Checkbox-Eingabefelder (z. B. „Prüfstatus" in Audit-Vorlagen) nahmen durch das allgemeine Formularraster-Styling fälschlich die volle Feldbreite ein — Checkboxen werden jetzt wieder in ihrer normalen, kompakten Größe links ausgerichtet dargestellt (betrifft Raum-/Grunddaten-Formulare und die Checklisten-Tabelle)

#### PDF-Designer: Mehrere wiederholende Blöcke auf einer Seite liefen nicht mehr synchron
- Enthielt eine Design-Seite mehr als einen „Wiederholender Block", lief bisher jeder Block unabhängig über alle Datensätze und erzeugte eigenständig neue Seiten — das führte zu vertauschten/duplizierten Ausgaben (z. B. Raum A im ersten Block, Raum B im zweiten Block auf derselben Seite)
- Alle wiederholenden Blöcke einer Seite werden jetzt gemeinsam im Gleichschritt durchlaufen: derselbe Datensatz-Index pro Durchlauf, ein gemeinsamer Seitenumbruch sobald irgendein Block nicht mehr auf die Seite passt, und alle Blöcke starten auf der neuen Seite wieder exakt an ihrer ursprünglich festgelegten Position (statt an einer generischen Position nahe dem Seitenanfang)

#### PDF-Designer: Elemente duplizieren & Seiten verschieben
- Neuer Toolbar-Button „⧉ Duplizieren" für das aktuell ausgewählte Element — erstellt eine exakte Kopie (inkl. aller Unterelemente bei freien Layouts) leicht versetzt neben dem Original
- Neue „▲"/„▼"-Pfeile an jeder Seiten-Miniaturansicht in der Seitenleiste zum Verschieben der Reihenfolge der PDF-Seiten

#### Live verifiziert
- Superadmin-Rollenzuweisung: Testnutzer zu „Superadmin" befördert (Dropdown + Speichern bestätigt funktionsfähig) und wieder zurückgesetzt
- Checkbox-Feld „Prüfstatus" beim Raum-Anlegen bestätigt in korrekter, kompakter Breite (13px statt gestreckt)
- Daten-Refresh bestätigt: über die API angelegter Testraum erschien nach einfachem Seitenwechsel (Dashboard → zurück zum Standort) automatisch in der Raumliste ohne manuellen Reload
- PDF-Designer: Testseite angelegt, mit „▲"/„▼" erfolgreich verschoben und zurückverschoben; wiederholender Block dupliziert (Versatz 16px bestätigt) und wieder entfernt — beide bestehenden PDF-Designs blieben nach Verlassen ohne Speichern unverändert erhalten
- Backend-Engine-Fix für synchrone Mehrfachblöcke per direkter PDF-Generierung verifiziert (zuvor vertauschte Ausgabe mit 2 gestapelten Blöcken, danach korrekt synchronisiert über alle Seiten)

## [1.10.2] - 2026-10-11

### Echtzeit-Formularvalidierung, Standardwerte für Dropdown-Felder & Wiederholblock-Editor-Fixes (fix005.md)

#### Neu: Echtzeit-Farbmarkierung für Pflichtfelder (Raum anlegen, Grunddaten)
- Pflichtfelder werden jetzt links farbig markiert: Rot (fehlt) solange leer, Grün (ausgefüllt) sobald ein gültiger Wert eingegeben wurde — statt eines reinen „*"-Sternchens, das jetzt entfernt wurde
- Das Raumname-Feld prüft zusätzlich live auf bereits vergebene Raumnamen am selben Standort: Bei einem Duplikat erscheint eine gelbe Markierung statt Rot/Grün sowie ein Warnhinweis „⚠️ Ein Raum mit diesem Namen existiert bereits für diesen Standort."

#### Neu: Standardwert für Auswahl-Datenfelder (Dropdown) in Audit-Vorlagen
- Beim Anlegen oder Bearbeiten eines „Auswahl (Dropdown)"-Datenfelds in einer Audit-Vorlage kann jetzt ein „Standardwert" aus den definierten Optionen gewählt werden (oder „-- kein Standardwert --")
- Der Standardwert wird beim Anlegen eines neuen Raums bzw. der Grunddaten eines Standorts automatisch vorausgewählt (und als bereits ausgefüllt/grün markiert) und beim Speichern korrekt übernommen, auch wenn das Dropdown nicht manuell angefasst wurde

#### Dashboard: Schnellzugriff-Kachel „Standorte" entfernt
- Da das schnelle Anlegen eines neuen Standorts kein typischer Schnellzugriffs-Anwendungsfall ist, wurde die entsprechende Kachel aus dem Dashboard entfernt — „Audits" und „Datenablage" bleiben verfügbar

#### PDF-Designer: Wiederholblock-Editor — Auswahl bleibt erhalten, Bild-Felder werden korrekt als Bild angezeigt
- Im freien Layout-Editor des wiederholenden Blocks führte ein Klick auf ein Element bisher dazu, dass die Auswahl sofort wieder aufgehoben wurde (ein über `mousedown` ausgelöster, aber erst beim nachfolgenden `click`-Event aufsteigender Hintergrund-Klick löschte die Auswahl) — die Auswahl bleibt jetzt stabil erhalten, bis bewusst auf eine leere Stelle der Zeichenfläche geklickt wird
- Felder vom Typ „Bild" (z. B. das Bilder-Datenfeld eines Raums) wurden im Editor bisher als Textzeile mit automatisch generiertem Label („Bilder: ") dargestellt — sie erscheinen jetzt korrekt als gestricheltes Bild-Platzhalter-Element ohne Label-Präfix, passend zur tatsächlichen PDF-Ausgabe (die bereits zuvor korrekt Bilder statt Text gerendert hat)
- Das Label-Präfix-Eingabefeld im Eigenschaften-Panel wird für Bild-Felder jetzt ausgeblendet, da es dort nicht anwendbar ist

#### Live verifiziert
- Rot/Grün/Gelb-Farbmarkierung inkl. Duplikat-Warnhinweis am Raumname-Feld der Vorlage „Prowise Begehung" getestet
- Standardwert „Stein" für das Dropdown-Feld „Wand" gesetzt, gespeichert, und beim Anlegen eines neuen Raums als vorausgewählt/grün bestätigt sowie nach dem Speichern in der Datenbank persistiert bestätigt (Testdatensatz anschließend wieder entfernt)
- „Standorte"-Kachel im Dashboard bestätigt entfernt
- Wiederholblock-Editor: Element-Auswahl bleibt nach Klick erhalten, Hintergrund-Klick hebt Auswahl weiterhin korrekt auf, Bild-Feld „Bilder" zeigt gestrichelten 🖼-Platzhalter ohne Label-Präfix-Eingabe

## [1.10.1] - 2026-10-11

### Wiederholblock-Vorbelegung, Kopfzeilen-Druckbereich & Mobile-Optimierungen (fix004.md)

#### PDF-Designer: Wiederholender Block übernimmt vorab gewählte Felder in den Layout-Editor
- Öffnet man den freien Layout-Editor für einen wiederholenden Block, der bereits über die einfache Feld-Listen-Auswahl mit Feldern belegt wurde, erscheinen diese Felder jetzt automatisch als anordenbare/sortierbare Elemente im Editor, statt stillschweigend zu verschwinden
- Jedes vorab gewählte Feld wird als eigenes „Feld-Variable"-Element mit Label-Präfix (z. B. „Raumname: ") untereinander angelegt und kann anschließend frei verschoben, umsortiert oder angepasst werden

#### PDF-Designer: Kopfzeile wird korrekt außerhalb des Druckbereichs gedruckt
- Die Kopfzeile wurde bisher innerhalb des oberen Randes des Druckbereichs platziert und konnte sich mit dort platzierten Design-Elementen überschneiden — sie liegt nun wie die Fußzeile sauber außerhalb des Druckbereichs mit Sicherheitsabstand zur physischen Seitenkante

#### Mobile Ansicht: Tabellen überlaufen nicht mehr die Seitenbreite
- Alle Tabellen (Räume/Objekte, Checklisten, Dokumente, Datenablage, Kategorien, Standorte, Auditvorlagen, Benutzerverwaltung, Backup, Logs) lassen sich im Mobile-Design jetzt innerhalb der Tabelle selbst horizontal scrollen, um z. B. Aktions-Buttons oder Bilder-Spalten zu erreichen, statt die gesamte Seite in die Breite zu drücken

#### Mobile Ansicht: Listen-Einträge (Standorte, Audit-Vorlagen) laufen nicht mehr über
- Lange Adress- bzw. Beschreibungstexte in den Listen-Einträgen werden jetzt per Ellipsis gekürzt bzw. auf sehr schmalen Bildschirmen vollständig ausgeblendet, statt über den Rahmen des Listen-Eintrags hinauszulaufen

#### Mobile Ansicht: Tab-Leiste (Räume/Grunddaten/Checklisten/Dokumente) bricht um
- Die Tab-Leiste innerhalb eines Standorts läuft nicht mehr über die Bildschirmbreite hinaus, sondern bricht bei Bedarf in eine zweite Zeile um

#### Mobile Ansicht: PDF-Designer zeigt Hinweis statt komplexer Canvas-Oberfläche
- Da der PDF-Designer auf eine Maus-/Tastatur-gestützte Bearbeitung auf großen Bildschirmen ausgelegt ist, wird auf mobilen Geräten jetzt ein Hinweis angezeigt, einen PC oder ein Tablet mit größerem Bildschirm zu verwenden, statt die unbedienbare Canvas-Oberfläche darzustellen

## [1.10.0] - 2026-10-11

### PDF-Designer: Freier Wiederholblock-Editor, Kopf-/Fußzeilen-Ausrichtung & diverse Bedienbarkeits-Fixes (fix003.md)

#### Neu: Freier Layout-Editor für den Wiederholenden Block im PDF-Designer
- Im PDF-Designer öffnet der Button „🖊 Eigenes Layout gestalten…" (bzw. „🖊 Layout gestalten (N Elemente)", sobald bereits Elemente angelegt wurden) am wiederholenden Block ein eigenes Canvas-Modal
- Darin lassen sich frei positionierbare Unterelemente anlegen: Text, Feld-Variable (mit Label-Präfix und „Ausblenden, wenn leer"-Option), Bild (aus Audit-Feld) und Trennlinie — alle per Drag & Drop auf einer Mini-Druckfläche verschiebbar, mit eigenem Eigenschaften-Panel (Schriftgröße, Farbe, Ausrichtung)
- Das bisherige einfache Feld-Listen-Layout bleibt als Fallback „Block-Felder (einfache Liste)" erhalten und wird nur verwendet, wenn kein eigenes Layout gestaltet wurde (100 % abwärtskompatibel zu bereits bestehenden Designs)
- Die Haupt-Canvas-Vorschau des Blocks zeigt nun ein Mini-Thumbnail der gestalteten Unterelemente inkl. „✓ N Elemente eigens gestaltet"-Hinweis
- Live end-to-end verifiziert: Anlegen von Feld- und Trennlinien-Elementen, Speichern, Reload, PDF-Erzeugung — der generierte PDF-Inhalt enthält exakt die gestalteten Elemente mit aufgelöstem Variablenwert (z. B. „Raum: EG01") und der gewählten Trennlinienfarbe

#### Neu: Ausrichtung von Kopf-/Fußzeilen-Text am Druckbereich
- Im Eigenschaften-Panel von Kopf- und Fußzeile steht jetzt „Ausrichtung am Druckbereich" mit den Optionen „⇤ Links", „↔ Mitte", „⇥ Rechts" zur Verfügung — unabhängig von der reinen Textausrichtung innerhalb des Feldes
- Live verifiziert: Rechtsbündige Kopfzeile mit Variable `{{siteName}}` im erzeugten PDF exakt am rechten Druckbereichsrand positioniert, Variable korrekt zu „Steinweg Berufsschule" aufgelöst

#### Tabellen: Automatische Zeilenbegrenzung je Seite
- Automatisch befüllte Tabellen (Datenfelder aus dem Audit) brechen nun korrekt um, sobald das Ende des Druckbereichs erreicht ist, und setzen die restlichen Zeilen auf einer automatisch eingefügten Folgeseite fort

#### PDF-Designer: Spaltenauswahl für Tabellen überarbeitet
- Auswahl der Tabellenspalten (Datenfelder aus Vorlage, inkl. Raum-/Objektname, Kategorie, Standortname) jetzt über eine übersichtliche Checkbox-Liste statt Freitext

#### PDF-Eigenschaften-Panel: Keine Scrollbar mehr, passt sich an Inhaltsbreite an
- Das Eigenschaften-Panel im PDF-Designer verbreitert sich automatisch, statt eine horizontale Scrollbar anzuzeigen

#### Speichern von PDF-Designs: Bestätigung als formatierte Erfolgsmeldung
- Erfolgreiches Speichern eines PDF-Designs zeigt jetzt eine grün formatierte Bestätigung („✓ Design erfolgreich gespeichert.") statt eines reinen Textes

#### Checklisten: Datenablage-Anzeige korrigiert
- Anzeigefehler beim Laden der Checklisten-Daten in der Datenablage behoben

#### Datenablage: Ordner-Dropdown im einheitlichen Design
- Das Dropdown zur Ordnerauswahl beim Verschieben von Dokumenten ist jetzt im einheitlichen `.styled-input`-Design gestaltet

#### Login/Netzwerk: CORS-Fix für Zugriff über andere Hostnamen/IP-Adressen
- Login- und API-Zugriffe funktionieren jetzt zuverlässig auch dann, wenn die Anwendung über eine andere IP-Adresse oder einen anderen Hostnamen als `localhost` aufgerufen wird

## [1.9.0] - 2026-10-11

### Checklisten-Live-Sync, vereinheitlichte Audit/PDF-Erstellung, Dokumente-Ordnerverschiebung, Datenexport mit Bildern, Lösch-Bestätigungen & Testdaten-Bereinigung

#### Neu: Checklisten-Reiter im Audit-Bereich mit 10-Sekunden-Live-Sync
- Im Standort-Bereich unter Audits gibt es jetzt neben „🏠 Räume/Objekte", „📋 Grunddaten" und „📄 Dokumente" einen vierten Reiter „✅ Checklisten"
- Dort werden alle Checklisten-Vorlagen angezeigt, die der aktuell gewählten Audit-Vorlage zugeordnet sind — eine Tabelle pro Checkliste, eine Zeile pro live erfasstem Raum, Spalten exakt im beim Erstellen der Checkliste definierten Layout
- Je nach Spaltentyp werden Werte automatisch aus dem Raumnamen (`source: room`) oder den Raum-Datenfeldern (`source: field`) schreibgeschützt angezeigt, oder als frei editierbares Feld (`source: custom`, Text/Zahl/Checkbox) dauerhaft gespeichert
- Alle Nutzer sehen Änderungen anderer Nutzer spätestens nach 10 Sekunden automatisch (Hintergrund-Polling), ohne die Seite neu laden zu müssen; Texteingaben während des Tippens werden durch das Polling nicht überschrieben (Commit erst bei Verlassen des Feldes, Checkboxen sofort)

#### Dokumente im Audit-Bereich: Audit-Erstellung und PDF-Generierung zusammengeführt
- Statt getrennter „Audit erfassen"-Tabelle und separatem PDF-Erzeugen-Dialog gibt es jetzt ein einziges Formular „Neues Audit erfassen & PDF erzeugen": Titel, PDF-Design und Dokumenttitel werden in einem Schritt erfasst — der aktuelle Stand aller Räume/Grunddaten des Standorts wird dabei als unveränderlicher Audit-Snapshot gesichert **und** sofort als PDF in die Dokumentenablage geschrieben
- Zusätzliche Dokumente lassen sich wie bisher über „📄 Weiteres Dokument erzeugen" je Audit nachträglich erstellen
- Neuer Button „✕ Audit löschen" je Audit-Zeile (mit Lösch-Bestätigung) entfernt das Audit inkl. aller zugehörigen Dokumente
- Das Eingabefeld „Neuer Ordnername" ist jetzt einheitlich im `.styled-input`-Design gestaltet
- **Neu:** Dokumente lassen sich per Dropdown direkt in der Aktionsspalte in einen anderen Ordner verschieben (oder zurück ins Hauptverzeichnis) — live getestet inkl. Anlegen, Verschieben, Löschen von Ordnern und Dokumenten

#### Löschbestätigungen als Modal statt Browser-`confirm()`
- Raum löschen (Audit-Bereich), Dokument löschen und Ordner löschen fragen jetzt über das app-eigene, gestylte Bestätigungs-Modal („Ja"/„Nein") nach, statt über den nativen Browser-Dialog

#### Datenexport (Admin Page) liefert jetzt Raumdaten und Bilder statt JSON
- Export je Standort und Gesamtexport enthalten jetzt pro Standort eine `Raeume.csv` (UTF-8 mit BOM, semikolon-getrennt, alle Datenfelder der Vorlage als Spalten) sowie einen Unterordner je Raum mit den zugehörigen Bildern als echte Bilddateien
- Nur noch **aktuell existierende (live) Räume** werden berücksichtigt — bereits gelöschte Räume tauchen im Export nicht mehr auf
- Live getestet: Einzelexport (Steinweg Berufsschule) und Gesamtexport beide erfolgreich heruntergeladen, entpackt und geprüft (BOM korrekt, CSV-Spalten inkl. Vorlagen-Felder wie „Whiteboard"/„Wand"/„Tafelgröße", Bilder korrekt je Raumordner zugeordnet)

#### Testdaten bereinigt
- Das versehentlich im System verbliebene Testaudit „Testaudit Automatisiert" (inkl. zugehöriger Dokumente und Raum-Snapshots) wurde entfernt

#### Logs zeigen jetzt den Benutzernamen statt der ID
- Statt „#1"/„#2" in der Spalte „Benutzer" wird jetzt der tatsächliche Benutzername (z. B. „superadmin") angezeigt; Systemaktionen ohne Benutzerbezug zeigen „System"

## [1.8.0] - 2026-10-11

### Dokumentenverwaltung, Datenablage-Drilldown, Backup-Überarbeitung & Passwort-Sicherheit

#### Neu: Vollständige Dokumentenverwaltung je Audit
- Im Audits-Bereich gibt es im Tab „📄 Dokumente" jetzt pro Audit einen aufklappbaren Bereich „Dokument erstellen": PDF-Design auswählen (nur Designs, die der jeweiligen Vorlage zugeordnet sind), Titel wird automatisch vorgeschlagen (editierbar), Fortschrittsanzeige während der Erzeugung
- Erzeugte Dokumente landen in einer vollwertigen Dateiverwaltung: Ordner anlegen, Dokumente in Unterordner verschieben, umbenennen, archivieren/dearchivieren, löschen, öffnen (Vorschau) und herunterladen
- Die Datenablage zeigt denselben Dokumentenbestand pro Standort **read-only** an (mit Hinweis, dass Verwaltung im Audits-Bereich erfolgt), damit nichts versehentlich aus der Ablage heraus verändert wird

#### Neu: Datenablage — Räume und Grunddaten zeigen jetzt echte Audit-Historie
- **Räume:** Klick auf einen Raumnamen zeigt alle Audit-Durchläufe, die diesen Raum erfasst haben, inkl. aller Feldwerte und Bilder (passend zum jeweiligen Vorlagen-Feldtyp formatiert) sowie einen Button „✏️ Im Audit bearbeiten", der direkt in den laufenden Audit zur Bearbeitung des Raums springt
- **Grunddaten:** Zusätzlich zu den aktuellen (live) Standortdaten werden jetzt eingefrorene Grunddaten-Snapshots je Audit-Durchlauf als eigene Karten angezeigt
- Der vorherige, fehlerhafte generische Raum-PDF-Button (falscher Verweis) wurde entfernt

#### Backup — jetzt wirklich vollständig und menschenlesbar
- **Logs waren bisher nicht im Backup enthalten** — `logs/audit_logs.jsonl` und `logs/error_logs.jsonl` werden jetzt in jedes Backup aufgenommen und beim Restore korrekt wiederhergestellt
- **Neu:** Zusätzlich zum technischen Backup (`database/audit-tool.db`, `uploads/`, `documents/` — unverändert die Grundlage für die Wiederherstellung) enthält jedes Backup jetzt einen Ordner `Lesbare-Struktur/` mit einer für Menschen nachvollziehbaren Ordnerhierarchie: `<Kategorie>/<Standort>/Grunddaten/…`, `.../Raeume/<Raumname>/…` und `.../Dokumente/…`, jeweils getrennt nach „Aktuell (live)" und den einzelnen Audit-Durchläufen
- In diesen lesbaren Ordnern werden Bilder (die technisch als Base64 in den Felddaten liegen) als **echte Bilddateien** extrahiert, alle übrigen Feldwerte stehen leserlich in `Daten.txt`
- `manifest.json` im Backup dokumentiert jetzt auch, dass Benutzerpasswörter ausschließlich als Einweg-Hash vorliegen
- Live getestet: Backup erstellen → herunterladen → Struktur geprüft (echte JPEGs, lesbare `Daten.txt`) → Restore durchgeführt → Datenbestand unverändert vorhanden

#### Sicherheit: Benutzerpasswörter werden jetzt gehasht gespeichert
- **Root-Cause:** Passwörter wurden bisher im Klartext in der Datenbank gespeichert und per einfachem String-Vergleich geprüft — dadurch lagen sie auch im Klartext in jedem Datenbank-Backup
- Passwörter werden jetzt mit **PBKDF2 (SHA-256, 100.000 Iterationen, zufälliges Salt)** gehasht gespeichert
- Bestehende Klartext-Konten werden **transparent beim nächsten erfolgreichen Login** auf den Hash migriert (kein Zwangs-Reset, kein Unterbruch)
- Alle Standard-Benutzer (`superadmin`, `admin`, `user`, `azubi`) werden ab sofort ebenfalls bereits gehasht angelegt
- Login-Funktion live getestet und funktioniert unverändert

#### Sonstiges
- Zeichenkodierungs-Fehler (Mojibake, z. B. „lÃ¶schen" statt „löschen") in mehreren deutschen UI-Texten der Dokumentenverwaltung behoben

## [1.7.9] - 2026-10-11

### Logs-Fix, Fehler-Styling, zweigeteilter Feld-Builder, UI-Politur

#### Logs zeigten immer userId 0 — behoben
- Root-Cause: Das JWT enthält **zwei Claims vom Typ `ClaimTypes.NameIdentifier`** (einmal den Benutzernamen aus `sub`, einmal die echte numerische User-ID) — `FindFirstValue()` griff nicht-deterministisch auf den ersten Treffer zu und lieferte oft den Benutzernamen statt der ID, was bei `int.TryParse` fehlschlug und `userId: 0` ergab
- `ResolveUserId()` durchsucht jetzt **alle** `NameIdentifier`-Claims und nimmt den ersten, der sich als Ganzzahl parsen lässt
- Logging-Abdeckung erweitert auf bisher ungeloggte Aktionen: PDF-Designs (Erstellen/Bearbeiten/Löschen), Checklisten-Vorlagen (Erstellen/Bearbeiten/Löschen), Benutzer (Anlegen, Passwort zurücksetzen, Aktiv/Inaktiv umschalten, Löschen)
- Frontend: Logs-Seite lädt die Einträge jetzt **automatisch** beim Öffnen der Seite (vorher nur per manuellem „🔄 Neu laden"-Klick)

#### Fehlermeldungen waren unformatierter Rohtext — behoben
- Root-Cause: Die `.alert`-CSS-Klassen für die `<Alert>`-Komponente fehlten **komplett** in `App.css` — dadurch wurden alle Fehler-/Erfolgs-/Hinweis-Banner app-weit (nicht nur bei Audit-Vorlagen) als unformatierter Text mit ❌/× dargestellt
- Neue Styles für `.alert`, `.alert-error`, `.alert-success`, `.alert-info`, `.alert-warning` ergänzt (roter/grüner/blauer Kasten mit Icon und Schließen-Button, analog zum Login-Fehler)
- Speichern-Handler für Audit-Vorlagen (Erstellen & Bearbeiten) in try/catch gekapselt und löschen den Fehler-Banner nun zuverlässig bei erfolgreichem Speichern

#### Stale Zustand beim Seitenwechsel behoben
- Die Datenfelder einer zuvor bearbeiteten Vorlage blieben nach Seitenwechsel und Rückkehr zur Vorlagen-Seite sichtbar, obwohl Name/Beschreibung bereits geleert wurden
- Der Seitenwechsel-Effekt setzt die Feld-Liste jetzt ebenfalls auf die Standardfelder zurück, sodass „Neue Vorlage" wirklich frisch startet

#### Audit-Vorlagen — zwei getrennte Feld-Bereiche statt Scope-Dropdown
- Statt eines Dropdowns pro Feld gibt es jetzt **zwei eigenständige Karten**: „🏠 Datenfelder für Räume/Objekte" und „📋 Datenfelder für Grunddaten"
- Jede Karte hat einen eigenen „+ Feld"-Button (weist automatisch den passenden Scope zu) sowie eigene ↑/↓-Reihenfolge-Pfeile
- Die Reihenfolge lässt sich jetzt sowohl beim **Erstellen** als auch beim **Bearbeiten** einer Vorlage ändern (vorher nur beim Bearbeiten)

#### Grunddaten — visuelle Trennung
- Die aus der Vorlage befüllten Grunddaten-Felder sind jetzt in einer eigenen, optisch abgesetzten Karte (`.ground-data-card`) unterhalb der festen Standort-Infotabelle dargestellt — sowohl im Audit-Bereich als auch in der Datenablage

#### Sonstiges
- Persistenz von Kategorien und PDF-Designs über `docker-compose down/up --build` hinweg erneut verifiziert (funktioniert korrekt; das einmalige „Design verschwunden"-Erlebnis war durch die Einführung des Storage-Volumes in der Vorversion verursacht und tritt nicht erneut auf)

## [1.7.8] - 2026-10-11

### Grunddaten-Felder, Raumliste Tabelle, Bilder-Fix, Logging, Persistenz

#### Audit-Vorlagen — Scope für Felder
- Jedes Feld in der Vorlage hat jetzt eine **Scope-Auswahl** (Räume/Objekte vs. Grunddaten)
- `scope:room` → erscheint im Raumformular
- `scope:site` → erscheint im Grunddaten-Tab des Standorts
- Beim Bearbeiten einer Vorlage werden `optionsText` und `scope` korrekt aus dem gespeicherten Typ geladen

#### Grunddaten-Tab — Vorlage-Felder
- Unterhalb der festen Standortinfos (Name, Adresse etc.) erscheint ein neuer Bereich
- Nur Felder mit `scope:site` aus der gewählten Audit-Vorlage werden dort angezeigt
- Werte können direkt dort erfasst und per „Grunddaten speichern" persistiert werden
- Backend: neuer Endpunkt `PUT /api/standorte/{id}/grounddata` — speichert nur `GroundDataJson`
- Datenablage: Grunddaten-Tab zeigt gespeicherte Grunddatenfelder (read-only) an

#### Räume/Objekte — Tabellenansicht statt Karten
- Raumliste jetzt als kompakte **Tabelle** (nicht mehr als Karten)
- Zeigt Raumname + bis zu 3 Textfelder aus der Vorlage
- Bilder-Spalte: Button `🖼 X Bild(er)` öffnet Galerie-Modal — nur wenn Bilder vorhanden
- ✏️ / ✕ Aktionsbuttons in der letzten Spalte
- Bearbeiten-Klick scrollt zum Formular und hebt die bearbeitete Zeile hervor

#### Bilder-Speicherung — Korrektur
- Bilder wurden beim Upload nicht in `roomFieldValues` persistiert
- Jetzt: Bilder werden als Base64-Strings mit `||` als Trenner direkt im Feldeintrag gespeichert
- Beim Bearbeiten eines Raums werden bestehende Bilder aus `fieldsJson` korrekt geladen
- Bild-Reihenfolge änderbar per ← / → Buttons

#### Logs — CRUD-Aktionen werden geloggt
- Backend: alle CRUD-Endpoints loggen jetzt via `AuditLogger.LogActionAsync()`
  - Kategorien: Erstellen, Bearbeiten, Löschen
  - Standorte: Erstellen, Bearbeiten, Löschen, Grunddaten speichern
  - Vorlagen: Erstellen, Bearbeiten, Löschen (inkl. Name-Pflichtfeldprüfung im PUT)
  - Räume: Erstellen, Bearbeiten, Löschen
- Benutzer-ID wird via `ClaimTypes.NameIdentifier` ausgelesen

#### Template-Formular — Fixes
- Fehler „Der Vorlagenname ist erforderlich" trat auch beim Bearbeiten auf, weil der PUT-Endpoint die Validierung fehlte → Pflichtprüfung jetzt im Backend-PUT vorhanden
- Formular ist jetzt ein `<form>` mit `onSubmit` statt lose Button-Click
- Bearbeiten-Modus: `optionsText` wird korrekt in das Eingabefeld geladen
- Abbrechen-Button setzt `templateFields` auf den Initialwert zurück

#### Editier-Zustand wird bei Seitenwechsel zurückgesetzt
- `editingCategory`, `editingSite`, `editingTemplate`, `editingChecklistTemplate`, `editingUser`, `showNewUserForm` werden beim Wechsel der Hauptseite alle auf `null`/`false` zurückgesetzt

#### Docker — Datenpersistenz
- Neues named Volume `audit_storage_data` in `docker-compose.yml`
- Volume wird auf `/storage` im Backend-Container gemountet
- SQLite-Datenbank, Backups, Uploads und Logs überleben jetzt `docker-compose down && up --build`

### Status
- ✅ TypeScript Build: 0 Fehler (24 Module)
- ✅ Backend Build: 0 Fehler (nur Paket-Warnungen)
- ✅ Docker Rebuild: Erfolgreich, alle 3 Container Up
- ✅ API Health Check: OK

## [1.7.7] - 2026-10-11

### CRUD-Erweiterungen, Logs, Mobile-Fix, PDF-Ausrichtung

#### PDF Designer — Element-Ausrichtung am Druckbereich
- Wenn ein Element ausgewählt ist, erscheinen 6 Ausrichtungs-Buttons in der Toolbar:
  - `⇤` Links am Druckbereich ausrichten
  - `↔` Horizontal zentrieren
  - `⇥` Rechts am Druckbereich ausrichten
  - `⇡` Oben am Druckbereich ausrichten
  - `↕` Vertikal zentrieren
  - `⇣` Unten am Druckbereich ausrichten

#### Backend — neue Endpoints
- `PUT/DELETE /api/categories/{id}` — Kategorie bearbeiten/löschen
- `PUT/DELETE /api/standorte/{id}` — Standort bearbeiten/löschen
- `PUT/DELETE /api/templates/{id}` — Vorlage bearbeiten/löschen
- `PUT/DELETE /api/rooms/{id}` — Raum bearbeiten/löschen
- `GET /api/admin/logs` — System-Logs via AuditLogger (JSONL-Datei)

#### Einstellungen — Edit/Delete für alle Objekte
- **Kategorien**: ✏️ Bearbeiten (mit Propagation-Hinweis), ✕ Löschen (verhindert wenn Standorte vorhanden)
  - Zeigt Anzahl der zugeordneten Standorte
- **Standorte**: ✏️ Bearbeiten (alle Felder), ✕ Löschen (verhindert wenn Audits vorhanden)
  - Zeigt Anzahl der Audits pro Standort; "Aktiv/Inaktiv"-Status durch echte Daten ersetzt
- **Vorlagen**: ✏️ Bearbeiten mit Feld-Reordering (↑↓ Buttons), ✕ Löschen verhindert wenn in Verwendung
  - Zeigt Anzahl der Audits pro Vorlage
- **Checklisten**: ✏️ Bearbeiten + ✕ Löschen (bereits löschen, jetzt auch bearbeiten)

#### Audits — Räume bearbeiten/löschen
- Neue "Aktionen"-Spalte in der Raumtabelle
- ✏️ Klick füllt das Formular zum Bearbeiten
- ✕ Löscht den Raum (mit Bestätigungs-Dialog)

#### System-Logs
- Echte Logs aus Backend (`/api/admin/logs`) geladen
- Textfeld-Filter nach Aktion oder Details
- Tabellarische Darstellung mit Zeitstempel, Benutzer-ID, Aktion

#### Mobile-Design Fix
- Header jetzt horizontal auf Mobile (statt vertical)
- Profil-Name versteckt auf Mobile (nur Avatar sichtbar)
- Seitentitel versteckt auf Mobile (spart Platz)
- `app-container` auf Mobile scrollbar
- Stats-Grid: 2×2 auf Mobile statt 1×4
- Formular-Grid: 1 Spalte auf Mobile
- Tabellen: horizontal scrollbar auf Mobile

#### Dashboard
- Schnellzugriff-Kacheln unter den Statistiken
  - 📋 Audits, 💾 Datenablage, 📍 Standorte (Admin)
- Direktnavigation ohne NAV-Menü öffnen

### Status
- ✅ TypeScript Build: 0 Fehler (24 Module)
- ✅ Docker Rebuild: Erfolgreich
- ✅ GitHub: `cbc3064` auf master

## [1.7.6] - 2026-10-10

### PDF-Designer v2 (Mehrseiter WYSIWYG) + UI Spacing Fix

#### PDF-Designer — Mehrseiten-Support
- **Seitenliste links**: Alle Seiten in einer Übersicht, aktive Seite hervorgehoben
- **+ Seite hinzufügen**: Neue leere Seite mit einem Klick
- **Seiten löschen**: X-Button an jeder Seite
- **Seitenname**: Direkt in der Seitenliste umbenennen (Klick auf Namen)
- **Seitenausrichtung**: Jede Seite individuell Hochkant oder Querformat
- **Druckbereich**: Roter gestrichelter Rahmen (toggle ein/aus im Header)

#### PDF-Designer — Kopf/Fußzeilen
- **Globale Kopf/Fußzeile**: Gilt für alle Seiten (⚙ Kopf/Fuß Button in Toolbar)
  - Unterstützt Variablen: `{{pageNumber}}`, `{{totalPages}}`
- **Seiten-spezifisch**: Je Seite eigene Kopf/Fußzeile überschreiben (Schalter "Globale Kopf/Fußzeile")

#### PDF-Designer — Neue Elementfunktionen
- **8 Elementtypen** (erweitert):
  - `T Text` — Freitext, doppelklick zum Bearbeiten, vollständige Formatierung
  - `⟨⟩ Variable` — Platzhalter aus Standortdaten oder Vorlagenfeldern
  - `🖼 Bild (fix)` — Statisches Bild hochladen (Logo, Firmenzeichen), Base64 gespeichert
  - `📷 Bild (Audit)` — Platzhalter für Audit-Fotos (automatisch befüllt bei Export)
  - `📊 Datentabelle` — Auto-befüllt aus Audit; Seitenumbruch wenn nötig
  - `🔄 Wiederholender Block` — 1× pro Raum/Objekt wiederholt
  - `― Linie` — Trennlinie (Farbe wählbar)
  - `▭ Box` — Rechteck/Rahmen

- **Tabelle & Block Spalten/Felder** (Eigenschaften-Panel):
  - Raumname, Kategorie, Standortname immer wählbar
  - Alle Vorlagenfelder der gewählten Vorlage wählbar

- **Neue Textformatierung**:
  - Unterstrich (U)
  - Vertikale Ausrichtung: Oben ⬆ / Mitte ↕ / Unten ⬇
  - Ecken-Radius (Schieberegler)
  - Transparenz/Opacity (Schieberegler)
  - Rahmenfarbe frei wählbar

- **Properties Panel**: Kein Scroll mehr, Breite automatisch angepasst

#### UI Spacing Fix (global)
- `.form-grid` gap: 16px — konsistenter Abstand zwischen Feldern
- `.form-card` padding: 20px, Buttons haben immer 16px margin-top
- Abstände zwischen Tabellen und darüberliegenden Formularen verbessert
- `.form-inline-row` (Label links, Input rechts) für kompaktere Formulare
- `.button-group` für einheitliche Button-Abstände

### Status
- ✅ TypeScript Build: 0 Fehler (24 Module)
- ✅ Docker Rebuild: Erfolgreich
- ✅ GitHub: `83d84f0` auf master

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
