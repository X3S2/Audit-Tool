# Planung Audit Tool

## Wichtige Vorraussetzung
- Das Tool ist vollständig in deutsch mit Umlauten wie ÄÜÖß usw. auch bei Exportdateien.
- Das Tool wird auf Github abgelegt, du übernimmst den Push und Pull automatisch.
- Du teilst bei der Planung die Entwicklund in Sinnvolle Blöcke und Meilensteine ein.
- Du erstellst bei der Entwicklung nach jedem Meilenstein einen Changelog (nach dem Beispiel von https://keepachangelog.com) auf Deutsch, eine neue Versionnummer vergibst du automatisch (X.Y.Z) (X= Major Update, Y=Minor Update, Z=Fixes/Anpassungen) und du übernimmst Rebuilds von Docker Containern usw. automatisch mit in dem Prozess.
- Nach jedem größeren Entwicklungspart dann ein GitPush.
- Die erstellten Container im Docker sind eindeutig zu benennen, nicht einfach nur datenbank sondern ordentlich und eindeutig benannt.
- Erster Schritt nach der Planung ist, eine Readme erstellen, in der du eine Checkliste baust, sehr detailiert, die du vor jedem Gitpush abharkst. So ist immer die aktuelle Checkliste auch online im Github.
- du bist hier mit Github verbunden, das Repository heißt "https://github.com/X3S2/Audit-Tool" du hast hier zugriff drauf. Das Repostitory ist leer.


## Tool Idee
Ich will ein Audit Tool bauen, mit dem ich für verschiedene Zwecke verschiedene Arten von Audits anlegen kann, basierend auf angelegte Standorte und Standort-Kategorien. Ein Audit beinhaltet immer, die Möglichkeit für verschiedene Räume oder Objekte, ein oder mehrere Bilder hochzuladen, zudem soll es möglich sein, allgemeine Infos pro Standort oder Raum oder Objekt oder per Bild eingetragen werden können. Bedeutet auch, dass man für den Standort allgemeine Infos ablegt

Ich will ein Tool, dass ein vollständiges Accountmanagement hat. Ich will Accounts anlegen können, Passwörter resetten und Benutzer bearbeiten und dafür brauch ich als Admin-Account die Möglichkeit Account anzulegen und auch rechte zu verteilen.

Das Tool soll die Möglichekeit bieten nach dem Audit auch eine PDF auszugeben, die alles grafisch/schriftlich zusammenfasst.

### Rechtegruppen:
- Superadmin  - Kann alles hat alle Rechte, kann Admin, Benutzer und Azubi als Gruppe vergeben. Dieser Account bin ich.

- Admin       - Kann alles hat alle Rechte, kann Benutzer und Azubi als Gruppe vergeben, kann aber nicht den Superadmin verändern, also weder das Passwort zurücksetzen noch den Account umschreiben. 
- Benutzer    - Standard Rolle, hat kein Zugriff auf Admin Page 
- Azubi       - weniger als Standard Rolle, hat kein Zugriff auf Admin Page

### Admin Page
Folgende Subpages (mit einem #### vor dem Namen) benötigt der Admin für seine Arbeit. 
#### Benutzerverweltung:
- Benutzer erstellen,
- Benutzer aktivieren/deaktiveren
- Benutzer löschen
- Passwörter zurücksetzen
- Rechteverteilung

#### Datenbank-Backup: 
- Backup erstellen manuell
- Backup wiederherstellen aus vorhandenen. Die sollen aufgelistet werden, mit 3 Buttons für Löschen, wiederherstellen und Sichern vor einer Löschung
- Automatische Backups einstellen
    + Wochentage anzeigen, mit Checkbox -> Mehrfachauswahl möglich
    + Uhrzeit für das Backup bestimmen, das Backup wird dann immer zu den gewählten Tagen und zu der Uhrzeit ausgeführt
    + es muss sich Einstellen lassen, wie viel Backups rückwirkend gespeichert werden(beim automatischen Backup), wenn die Zahl erreicht ist, wird das älteste Backup gelöscht. (rotierend wie bei Dashcams mit den Videoschnipseln)
    + es sind immer Vollbackups also Accounts und Daten+Bilder+Config usw.
    + Admin hat die Change backups zu markieren, die nicht gelöscht werden, die sind dann von der Löschung ausgenommen

#### Datenexport
- Der Admin benötigt eine möglichkeit einen Gesamtdaten-Export durchzuführen.
    + Der Admin kann erhält dann eine ZIP mit allen Daten
        1. Die Anordnung soll herachisch definiert sein.
        2. Standort-Kategorie -> Standort -> Räume/Objekte
        3. Beispiel: Eine Kategorie ist "Grundschulen" ein Standort heißt "Goldberg HSt" und dort enthalten sind z.B. 10 Räume, für die Räume sind jeweile ein oder mehrere Bilder aufgenommen worden und informationen hinterlegt worden. Dann wird ein Zip Ordner erstellt wo alle Kategorien als Ordner angelegt sind, dann in jedem der Ordner passend der Standort als Ordner enthalten ist. Innerhalb des Standortes Werden dann die Raum oder Objektnamen hinterlegt. Und in diesem Raum wir dann ein Bild gespeichert. Hier kann man es simple halten, und das Bild mit benennen mit dem Datum im Format: "YYYY-MM-DD_HH-MM-SS.jpg"(so kann das auch gerne auf dem Server in der Datenbank hinterlegt sein).
        4. Also bekommt man einen Zip Ordner, der die gleiche Anordnung hat wie im Server die Kategorie->Standort->Raum abgelegt werden. Bei solch einem Download wird das Bild und die Daten in der auf dem Server enthaltenen Originalgröße ausgegeben.
        5. Was noch alles im Ordner sein soll werde ich in den anderen Punkten erklären.


## Grundbasis
### Docker und Serverbasis des Tools
- Das Tool soll auf einem Windows Docker entwickelt werden, und später auf einen Synology NAS Docker portiert werden.
- Das Tool soll eine Webschnittstelle haben und soll auf Port 4714 aus dem Netzwerk erreichbar sein.
- Die Synology NAS nutzt zudem einen Cloud VPN Dienst von IPv64.net und bekommt dort eine Domain namens https://audit.1561.ipv64.net wo aktuell noch ein altes Tool läuft, das hiermit abgelöst wird.
- Die NAS selbst hat mehrere TB Speicher und Raid.
- Ich möchte eine richtige Datenbank dahinter haben, keine CSV reine Speicherung der Daten. In der Datenbank sollen die Benutzerdaten sowie die Audits und alle Konfigurationen und Bilder gespeichert werden.
- Bilderupload muss möglich sein, vollumfänglich, wie und wo genau erklär ich in den einzelnen Parts. Die Bilder müssen ggf. mal aus dem Tool herausgezogen und abgelegt werden, dazu muss ich entweder pro Standort jeweils beim Standort oder für alle Standorte gleichzeitig im Adminmenü die Möglichkeit haben. Ein Bilderupload muss begrenzt werden, und zwar in der Dateigröße. Es ist möglich über JavaScript beim Upload eines Bildes bereits offline auf dem Endgerät, die Bilder zu komprimieren. Die Quallität darf nicht zu sehr darunter leiden, hier wird feintuning nötig sein, daher mach es leicht einstellbar. Die Bilder werden meist über mobile Daten auf den Server hochgeladen. Um Datenvolumen und Bandbreite zu sparen, muss hier komprimiert werden.
- Export der Daten, beim Export von Bildern muss das ganze als Zip gepackt und runtergeladen werden. Ein Export ist pro Standort wenn man auf der Standort Seite ist möglich oder für alle Standorte in der Admin Page Datenexport.

### Webseite Grundidee
- Die Webseite muss mobil optimiert sein kann aber auch von einem PC aufgerufen werden.
- Die Seite ist modern aufgebaut, Primärfarben sind schwarz weiß blau. Wobei im Dark und Whitemode natürlich darauf geachtet werden muss, dass die Schrift nicht weiß auf weiß oder schwarz auf schwarz ist.
- Die Webseite hat einen Darkmode und einen Whitemode
	+ Ein jeder Nutzer kann für sich selbst entscheiden, ob er Dark oder Whitemode nutzt.
	+ Standard Browser Einstellung wird beim Login und im Account genutzt bis der User selbst umstellt.
	+ Der zugehörige Button ist Sonne / Mond für die Symbolik.
	+ Der Button zeigt immer das Gegenteil von dem an, was aktuell aktiv ist. Also wenn Darkmode der Webseite gezeigt wird, dann Sonne als Symbol zeigen, wenn Whitemode dann Mond zeigen. Der Toggle darf nie, egal ob automatisch oder durch manuelle Einstellung, bei Whitemode die Sonne oder bei Darkmode den Mond zeigen.
	+ Die Konfiguration des Dark- oder Whitemode wird zusätzlich im UserProfil hinterlegt und veränderbar angezeigt
- Jeder User hat ein UserProfil in dem er sein Passwort ändern kann, oder den Darkmode/Whitemode.
    + Der Accountname und der Rollenstatus wird angezeigt, nicht veränderbar an dieser Stelle.
- Die Webseite dient als Tool um ein Audit und die Datenablage zu vereinfachen.


#### Webseitenaufbau Grundaufbau
- Landingpage: Hier muss veränderbar ein Titel eingetragen werden, trag erstmal ein "Audit-Tool".
    + Ein Login mit einem Benutzernamen, und einem Passwort. 
    + So eine Art Footer soll einfach nur in kurzen Worten erklären, dass dies ein internetes Tool ist und lediglich zur Hilfe beim Arbeiten genutzt wird.
- Userprofil:
    + Hier kann der eigene Account angeschaut werden, Username und Rolle wird angezeigt, nicht veränderbar.
    + Man kann Dark- und Whitemode anpassen
    + Eine Möglichkeit um sein Passwort zu ändern
    + Hinweis dass bei Problemen mit dem Account der Admin angesprochen werden muss
- Nach dem Login:
    + oben ein Header, dort steht der Name des Tools mittig, erstmal Audit-Tool, mach das veränderbar zusamemen mit der Langingpage.
    + rechts oben im Header kommt für den Account ein Account Bild"-Dummy" hin.
	    1. Beim Klicken auf das Bild geht ein kleines Menü auf und man kann auf Userprofil gehen, Passwort direkt ändern oder Logout anwenden.
	    2. Bei einem PC oder breitere Tablets steht link neben dem Dummy der Name des Users der angemeldet ist. Links davon der Button für Whitemode oder Darkmode.
    + links unter dem Header beginnt auf dem PC ein NAV Menü(Menü-Toggle im Header lässt das Menü verschwinden oder erscheinen), bei mobiler Webseite ein aufklappbares Menü(Togglebutton im Header) für Tablets kann man das Menü auch über einen Button auf und zu Togglen(Button dazu wie bei mobil im Header)
    + NAV Menü:
        1. Dashboard
        2. Audits
        3. Datenablage
        4. Einstellungen(nur für Rechtegruppe Admin und Superadmins sichtbar)
        5. Admin Page (Nur Superadmin und Admin)
    + Wenn das NAV Menü Subpages hat, werden die im NAV Menü durch das klicken auf NAV Menü aufgeklappt und sind sichtbar und auch dort ansteuerbar. Neben den jeweiligen Punkten im NAV Menü kann man die Punkte auch vor dem Klicken schon aufklappen über ein Pfeilchen oder so.
    + Header bleibt Sticky immer oben, aber der Body scrollt nicht hinter dem Header, der Body beginnt unter dem Header. Der Body muss so definiert sein, dass er erst unter dem Header beginnt.
- Dashboard(das ist nur Fronpage, das was angeboten ist, wird dann in den Subpages gemacht, hier sind nur Verlinkungen):
    + Hier wird angeboten am letzten Standort weiter zu arbeiten, dazu wird pro User gespeichert wo die letzte Aktivität war.
    + Hier wird angeboten einen neuen Standort anzulegen, das führt dann in die Auditeinstellungen zum Standort Anlegen.
    + Hier wird angeboten zum User Account zu kommen um dort Einstellungen zu machen. Würde dann ins UserProfile verlinken.
- Audits und Datenablage sind im grunde sehr nah beineinander, daher wird sich das sehr ähneln, die Audits sind dazu da, um anhand einer Vorlage als eine Art Schablone die Räume und Objekte die angelegt werden zu füllen. Die Datenablage lässt sich ganz ähnlich öffnen, zeigt in der Ordner Struktur dann die verschiedenen abgelegten Audits an.
- Audits:
    + Audits dient zum erstellen/bearbeiten eines Audits, nach einer Audit-Vorlage.
    + Hier wird eine Seite angezeigt die erstmal die verschiedenen Standort-Kategorien anzeigt, diese sind von A-Z sortiert.
    + Wenn man eine Standort-Kategorie öffnet, kommt man zu den Standorten, die dieser Kategorie zugeordnet sind. Die Standorte sind von A-Z Sortiert.
    + Klickt man auf einen Standort öffnet sich eine Auswahl, welches Audit man bearbeiten/erstellen will. Die Auswahl kommt aus den Audit-Vorlagen. Spezifische für dieses Audit, werden die Räume gefiltert, und nur noch angezeigt, was mit dieser Vorlage in Zusammenhang steht.
        1. Hier hat man 3 Reiter mit denen man arbeiten kann, einmal Räume/Objekte und einmal Grunddaten des Standorts und dazu noch Dokumente.
        2. beim Öffnen des Standortes werden immer erstmal die Räume/Objekte angezeigt, wenn man den Reiter Grunddaten des Standorts öffnet, kann man dort Daten eingeben, die seperat aufgenommen werden. Das ist später wichtig für das erstellen des Audits. Was genau in den Grunddaten angegeben wird, muss man in den Audit-Vorlagen bestimmen. Dazu mehr später.
        3. In Räume/Objekte werden die Räume aufgelistet, die bereits erstellt wurden. Man kann dann in den Raum klicken und dort im Raum und für das vorher gewählte Audit Bearbeitungen vornehmen, heißt nach der Audit-Vorlage die Informationen eintragen die in der Vorlage gewünscht sind. Man kann wieder Zurück um einen anderen Raum zu wählen. Sollte der Raum noch nicht existieren, kann man diesen für den Standort anlagen. Räume sind Standort übergreifend. Man benötigt eine Anzeige, für den Raum, wie viele der Daten aus der Vorlage schon ausgefüllt wurden für den spezifischen Raum. Entweder als Zahl oder als Fortschrittsbalken. 
        4. In einem Raum/Objekt, werden nach der Vorlage die Felder gefüllt oder z.B. ein Bild hochgeladen. Die Felder die gefüllt werden können auch einfache Dropdowns oder Checkboxen sein. Es gibt auch ein Kommentarfeld, das nicht unbedingt ein Kriterium ist, ob die Vorlagen ausgefüllt sind, dass muss man beim Erstellen einer Vorlage definieren können, damit hier der Fortschrittsbalken dies auch richtig bewertet und übernimmt. Also imprinzip eine Exklusion für den Fortschrittsbalken.
        5. Zusätzlich muss am Fortschrittbalken ein Button sein, um den Raum sozusagen zu Deaktivieren. Stell dir das so vor, die hast ein Raum im Audit aufgenommen, und es stellt sich in einem Nachgespräch mit dem Kunden heraus, dass dieser Raum nicht behandelt werden soll, dann muss ich entweder den Raum löschen und verliere so die Daten für künftige Arbeiten, oder ich belasse es dabei und deaktiviere den Raum, dieser tauscht mit einer Deaktivierung nicht im AuditPDF auf und auch nicht in der Checkliste. Dies ist ein Toggle der für alle bis auf die Rechtegruppe Azubis angezeigt wird.
        6. Dokumente ist ein Reiter in dem man ein AuditPDF generien kann, oder die Checkliste öffnen kann. Die AuditPDF ist später automatisiert und wird als PDF ausgegeben. Die Checkliste ist eine Checkliste in Tabellenform, in die für jeden Raum eine Zeile erstellt wird, aus den jeweils für das Audit aufgenommenen Daten. Die Checkliste hat den Zweck, dass die Räume, nach einem Audit von dem jeweiligen Benutzer nochmal abgenommen werden müssen. Heißt, man kontrolliert was, nimmt es im Audit auf und muss die Fertigstellung quittieren. Das passiert in der Checkliste. Die Checkliste muss von mehreren Personen gleichzeitig geöffnet werden können und auch bearbeitet werden können mit einem Live-Sync der alle 10 Sekunden abgefragt wird. Heißt Nutzer A befindet sich in einem Raum, harkt ab was man für Checks in der jeweiligen Audit-Checkliste definiert hatte, und der Nutzer B der sich im gleichen Standort aber nicht im gleichen Raum befindet, und die Checkliste auch geöffnet hat, wird alle 10 Sekunden die aktuellen Infos des jeweils anderen Nutzers sehen. So verhindert man, dass die Nutzer mit alten Daten arbeiten.
    + Grunddaten des Standorts:
        1. Hier wird einfach Tabellarisch aufgelistet, der Name, Adresse, Telefonnummern(auch Objektbetreuer/Hausmeister) und die Anzahl der Räume die schon insgesammt, aufgenommen wurden.
        2. Zudem gibt es noch die Objekte die man in der Vorlage definiert hat, die Standortspezifisch und nicht Raumspezifisch sind, also sowas wie Parkplatz usw. Diese werden hier und nicht bei den Räumen aufgelistet, heißt man bekommt die Objekte hier zu Auswahl die in der Vorlage sind, und kann diese mit Informationen füllen und ggf. Bilder hochladen. 
    + Anlegen von Räumen, ein Raum der in dem Audit noch nicht begangen wurde oder angelegt wurde, kann ja erstellt werden, ein Raumname muss eindeutig sein, kann also nicht 2x existieren, ein Raumname kann Buchstaben und Zahlen enthalten, manchmal auch Punkte(.). Räume die noch nicht von dem Audit begangen wurden können auch angezeigt werden, Doppelanlegen ist nicht möglich, daher muss immer gut sichtbar sein, welche Räume schon existieren, vielleicht kann man das beim erstellen so machen, dass falls man nicht gesehen hat das ein Raum existiert, und man diesen ein 2. Mal anlegen will, stattdessen den Hinweis bekommt, dass der Raum schon existiert, aber man den Raum direkt auswählen kann, dann muss ein Link angeboten werden diesen auszuwählen, als würde man den auf normalen Wege anklicken.  
- Datenablage:
    + Wie bei Audits öffnet man erst die Kategorie, dann den Standort und erhält dann aber eine Auswahl der verschiedenen Räume, die für diesen spezifischen Standort bereits erstellt wurden. Man öffnet den Raum/Objekt und sieht die Audits, die bereits erstellt wurden für den jeweiligen Raum/Objekt.
        1. Das dient als Ansicht für die jeweiligen Räume, man kann verschiedene Infos sehen, aber Grundlegend ist es der selbe Raum/Objekt.
        2. Die Infos sind auf die verschiedenen Audits aufgesplittet.
- Einstellungen:
	+ Standort-Kategorie erstellen/bearbeiten (sind einmalig, also muss das geprüft werden)
	+ Standorte erstellen/bearbeiten(sind einmalig, also muss das geprüft werden) und einer Standort-Kategorie zuordnen
    	1. Name
        2. Adresse
        3. Telefonnummer
        4. Telefonnummer des Hausmeisters
        5. Zuordnung der Standort-Kategorie
    + Audit-Vorlagen erstellen/bearbeiten
    	1. Datenfelder definieren, also welche Daten augenommen werden, neue hinzufügen, vorhandene bearbeiten und vorhandene löschen ist wichtig.
        2. Felder einen Dateityp geben (Zahl, Text inkl. Zahl, Auswahl also ein Dropdown bei dem ich zu dem Dropdown mehrere Werte definieren kann und auch den Standardwert definieren kann und diese Werte sowie der Standardwert muss auch bearbeitet werden können oder gelöscht werden können)
        3. Felder einer Reihenfolge zuordnen, die später in eine andere Ansicht gebraucht und übernommen wird.
        4. Man muss für die Felder definieren können, ob diese für den Fortschrittsbalken im Audit relevant sind.
        5. Es müss beim erstellen einer neuen Vorlage die Möglichkeit geben, einen Namen zu definieren, den muss man später auch bearbeiten können, der Name muss eindeutig sein, nicht 2x den gleichen Namen.
        6. Beim Erstellen einer neuen Vorlage kann man eine ander Vorlage kopieren und als anderen Namen speicher und bearbeiten.
        7. Speziell für Grunddaten des Standortes wird es ein paar Objekte geben die man hier anlegen wird, diese sind ähnlich wie bei den Räumen aber sind unabhängig von der Checkliste. Im AuditPDF muss man hier aber die Bilder oder Daten die man hinterlegt auswählen können und im PDF Designer hinterlegen können. Also man legt es im Prinzip hier in der Vorlage fest was als Datenfelder aufgenommen wird, und ob ein oder mehrere Fotos hochgeladen werden können, oder ob es nur ein Texteintrag ist, und das wird dann als Information, ähnlich wie bei den Räumen auch in den Grunddaten aufgelistet, dies ist nur speziell für den Standort im allgemeinen, deshalb getrennt voneinander. Z.B. kann hier aufgenommen werden, ob ein Parkplatz vorhanden ist oder ein Aufzug im Gebäude ist. Und andere wichtige Daten die man hier als Felder definiert.
    + Audit-Checkliste erstellen/bearbeiten und Zuordnung zur Audit Vorlage
    	1. Die Checkliste ist eine Tabelle, generiert aus den Audit Eintragungen, des jeweiligen Audits, das mit der jeweils zugeordneten Audit-Vorlage erstellt wurde. Dazu muss man eine Vorlage beim erstellen eindeutig benennen können und danach zuweisen können. Beim erstelln muss man aus den Vorhenden eine Kopie mit anderem Namen erstellen können. Dann muss auch die Audit-Vorlage gewählt werden.
        2. Checkliste ist eine Tabelle, wo jeder Raum / Objekt des jeweiligen Audits aufgelistet wird, welche Datenspalten benötigt sind, wird in der Auditvorlage ausgewählt. Ebenso auch dessen Spaltenposition bzw. Reihenfolge in der Checklisten.
        3. Zur Auswahl für die Datenspalte der Checkliste gibt es die Datenfelder der Vorlage und freie Felder deren Spaltennamen ich selbst definieren kann. Ebenso kann man definieren, ob in der Spalte z.B. Zahl/Text oder eine Checkbox enthalten ist. Solch eine Checkbox oder ein Textfeld oder Zahlenfeld sind dann frei befüllbar oder die Checkbox anklickbar. Diese Felder sind dann für den Live-Sync wichtig zu aktuallisieren.
		4. mehr als eine Checkliste kann der Audit-Vorlage zugeordnet sein. Z.B. eine für vor der Installation und eine für nach der Installation, oder vielleicht auch 2 für unterschiedliche Themen.
	+ AuditPDF-Designer
    	1. Hier wird ein PDF Design erstellt, dass man einem Audit zuweisen kann. Es könnene verschiedene PDF Designs erstellt werden aber immer noch eins pro Auditvorlage zugewiesen werden. Eine Vorlage kann aber in mehreren Audit-Vorlagen gleichzeitig verwendet werden.
        2. Der Designer ist eine "What you see is what you get" Ansicht zu einem PDF, das vom Tool aus den Auditdaten automatisch generiert wird. Stell dir das wie Word Serienbrief drucken vor mit einer Tabelle(hier das Audit) als Datenzrundlage. Es muss wie word ein Druckbereich definiert werden, Fuß und Kopfzeile wenn nötig, usw.
        3. Ein Design, kann von mehreren Audit-Vorlagen benutzt und zugeordnet werden.
        4. Man erstellt ein Deckblatt, mit Information wie Standort-Kategorie, Standort Name, Adresse des Standortes, Telefonnummer des Standorts Telefonnummer des Hausmeistersdes Standortes oder einem Freitext. dazu bestimmt man wo welcher Text gedruckt wird. Eine Ausrichtung anhand des Blattes muss mögleich sein, z.B Schrift mittig oder rechtsbündig. Die Informationen die in der Audit-Vorlage stehen können hier als "Variable" ausgewählt werden.
        5. Dann kann man sich die nächste Seite definieren, hier kann man z.B. eine Tabelle auflisten, Infos des Standorts und der zugeordneten Vorlage stehen hier zur Verfügung, also die Datenfelder aus der Vorlage. 
        6. Pro Seite muss es möglich sein die Seitenoriengierung, also Hochkant oder Quer zu definieren, zudem muss man ein Seitenumschlag definieren können wie bei Word.
        7. Generell soll sich der Designer wie Word Serienbrief Erstellung anfühlen. Ich definiere wie in Word das Design, die Datenquellen werden festgelegt und dann wird ein beim Erstellen der AuditPDF im Audit, das Design mit Daten gefüllt. Die Vorlage muss also eine dynamische Erweiterbarkeit besitzen, alao ich will an einer Stelle sagen können, wie eine Standard Datensatz-Seite aussieht, und diese wird durch den Datenimport gefüllt mit Inhalt und dann wird die Seite so häufig wieder holt bis alle Datensätze einmal importiert wurden. Auch Blöcke definieren statt ganze Seiten muss möglich sein, also wenn ich pro Blatt mehrere Infos auf die Seite bekomme, soll es möglich sein, dass der Block anhand der Audit Tabelle für jeden Eintrag wiederholt wird. Stell dir das vor wie eine Tabelle mit X Einträgen, wir bilden einen Block oder eine Tabelle in dem AuditPDF Design, und definieren was in dem Block oder der Tabellspalten enthalten ist, und der Block wird dann X mal wiederholt aufgedruckt. bei einer Tabelle wird die Tabelle so häufig wie Möglich im Druckbereich erweitert und ansonsten auf der nächsten Seite weiter geführt.
		8. es muss möglich sein auch Linien oder Kästchen als Objekte zu definieren die im Design übernommen werden.
		9. man muss klar auch Bilder im PDF abdrucken können, die vorher in das Audit hinein geladen wurden.
        10. Man muss auch die Möglichkeit haben, selbst ein Bild hochzuladen, dass in der Vorlage verwendet werden soll. Transparente Bilder bzw. Bilder mit einem Transparentanteil sind auch möglich. z.B. ein Logo einer Firma soll auf das Deckblatt, dann lad ich das Bild hoch und kann es dort an einer beliebigen Stelle im Designer einfügen.
        11. Stell es dir wirklich wie ein Serienbrieg vor, aber statt immer wieder die gleiche Seite zu machen, kann sich ein bestimmter Balken bzw. Gruppierung von Objekten immer wiederholen, wenn man das als wiederholbare Gruppierung einfügt. dann wird die solange wiederholt wie Datensätze in der Datenbank sind. Also in dem Fall ist die Anzahl der Räume für dieses Audit die ausschlaggebende Zahl der Wiederholungen. Der Raum Deaktiveren Toggle der beim Fortschrittsbalken ist, kann hier für ausschlaggebend sein, heißt bei Deaktivierung eines Raums wird dieser nicht mit aufgelistet.
        12. Es muss auch möglich sein, ein Freitext zu schreiben, den will ich wie in Word formatieren können und dann z.B. als Abschluss Seite anhängen.
        13. Für manche Zwecke wäre es auch gut, wenn man im PDF Designer bestimmte Summen aus einer Anzahl Bilden kann, z.B. würde ich gerne die Anzahl der Räume oder die Anzahl einer Auswahl im Audit zusammenzählen wollen, also z.B. gebe ich die Auswahl grün und blau zur Verfügung, beim Audit habe ich bei 10 Räumen 4x Blau und 6x Grün gewählt, die Summe will ich auflisten, also schreib ich irgendwo hin Blau = AuditSumme(%Variable_für_blau%) oder so ähnlich, fast wie man das in Excel machen würde. Natürlich sind die Deaktivierten Räume hier ausgenommen.
        14. Das Erstellte Audit, wird als Link auf dem Reiter "Dokumente" im Standort angezeigt. Heißt ein fertiges Audit muss gespeichert bleiben auf dem Server für einen späteren Download. Abgelegt wird es unter folgender Namenskonvention: <Standort-Kategorie>_<StandortName>_<Audit-Name>_Datum(in YYYY-MM-DD_HH-MM-SS).pdf
        Beispiel dafür "Grundschule_Goldberg-HSt_Prowise-Begehung_2026-10-09_16-17-10.pdf" (Kategorie = Grundschule, StandortName = Goldberg-HSt, Audit-Name = Prowise-Begehung, und das Datum+Uhrzeit)
        Die Audit PDF wird nach Namen aufgelistet das neuste dann nach oben.
- Admin Page
    + hier muss es 3 verschiedene Subseiten geben, nicht alles auf eine Seite klaschten.
    + Die Seiten sind dann:
        1. Benutzerverwaltung
        2. Datenexport
        3. Datenbank-Backup
    + Datenexport und Benutzerverwaltung sind von Admins und Superadmins sichtbar
    + Datenbank-Backup ist nur von Superadmin sichtbar
    + Für den Datenexport sind enthalten:
        1. Alle Standort-Kategorien als Ordner
        2. In den Standortkategorien die Standort Namen als Ordner
        3. In den Standort Namen dann die Raum/Objektnamen als Ordner und zusätzlich Ein Ordner "_Dokumente" in dem die erstellten AuditPDFs mit dem Namen wie die abgelegt werden und die Checklisten als CSV Export mit Namen der Checkliste + Datum und Uhrzeit(in diesem Format YYYY-MM-DD_HH-MM-SS). Zusätzlich soll auch ein Ordner "_Grunddaten des Standorts" erstellt werden, in dem in eine CSV die Grunddaten des Standorts gespeichert werden. Die CSV kann einfach "Grunddaten_<Standort-Kategorie>_<StandortName>.csv" heißen.
        4. Zusätzlich soll in "Dokumente" eine CSV erstellt werden, pro Audit eine, mit den Daten aus dem jeweiligen Audit, und das als Raumübergreifende Zusammenfassung. Der Dateiname "Zusammenfassung_<Audit-Name>.csv". Es kann sein, dass in einem Kommentarfeld mehrzeilig im Audit geschriebe wurde, also mit "\n" bzw. "Enter" gearbeitet wurde, das bitte dann in eine einzige Zeile schreiben und stattdessen ein "|" als Trennung verwenden.
        5. In den jeweiligen Räumen/Objekten soll jeweils ein Unterordner für jedes Audit existieren, wo die Daten getrennt von einander abgelegt werden. Also immer ein Ordner pro Auditvorlage in jedem Raum, wo die jeweiligen Bilder abgelegt werden. Die Infos also was im Audit alles aufgenommen wurde, braucht nicht pro Raum eingefügt werden, das wär zu viel, deshalb wird in Dokumente





