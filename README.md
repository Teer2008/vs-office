# vs-office

Verwandle VS Code zu deinem Büro.

## Funktionen

### PDF-Editor

`*.pdf`-Dateien öffnen sich direkt in VS Code. Du kannst Text markieren, Freitext und Zeichnungen hinzufügen, Bilder einfügen und das Ergebnis mit Strg+S speichern.

### Tabellen-Editor (.xlsx)

`*.xlsx`-Dateien öffnen sich in einem vollwertigen Tabellen-Editor auf Basis von [Univer](https://univer.ai) – Bedienung wie in Google Sheets oder Excel, komplett lokal ohne Konto oder Internet:

* über 500 Funktionen (`SUMME`, `SVERWEIS`, `WENN`, `INDEX`/`VERGLEICH`, Datums-, Text- und Statistikfunktionen …) mit Live-Neuberechnung
* Formatierung: Schrift, Farben, Rahmen, Zahlenformate, Ausrichtung, Zeilenumbruch
* Verbundzellen, fixierte Zeilen/Spalten, ausgeblendete Zeilen/Spalten, mehrere Tabellenblätter
* Rückgängig/Wiederholen, Kopieren/Einfügen, Auto-Ausfüllen
* Strg+S speichert als normale `.xlsx`, die Excel und LibreOffice lesen

Befehl **Office: Neue Tabelle (.xlsx)** legt eine leere Tabelle im Projektordner an und öffnet sie. Eine leere `.xlsx`, die du im Explorer neu anlegst, funktioniert genauso.

Das Farbschema folgt dem VS-Code-Theme (hell/dunkel).

**Was beim Speichern nach .xlsx mitgenommen wird:** Werte, Formeln (mit zuletzt berechnetem Ergebnis), Zahlenformate, Schrift, Farben, Rahmen, Ausrichtung, Verbundzellen, Spaltenbreiten, Zeilenhöhen, ausgeblendete Zeilen/Spalten, fixierte Bereiche, Tab-Farben, ausgeblendete Blätter.
**Nicht mitgenommen:** Bilder, Diagramme, Kommentare, Datenüberprüfung, bedingte Formatierung, Makros. Öffnest du eine Datei mit solchen Inhalten und speicherst sie, gehen diese verloren – dann besser eine Kopie bearbeiten.

### UML-Editor (.uml)

`*.uml`-Dateien öffnen sich in einem grafischen Diagramm-Editor, der für Touchpad und Tastatur gemacht ist: keine Rechtsklick-Menüs, nichts muss präzise gezogen werden. Befehl **Office: Neues UML-Diagramm (.uml)** fragt den Diagrammtyp ab und legt die Datei an; eine leere `.uml` aus dem Explorer geht genauso.

Diagrammtypen und Formen:

* **Klassendiagramm** – Klassen (Attribute/Methoden als Zeilen), Schnittstellen, Aufzählungen, abstrakte Klassen (kursiv), Pakete; Assoziation, gerichtete Assoziation, Aggregation, Komposition, Vererbung, Realisierung, Abhängigkeit, Multiplizitäten und Rollennamen an beiden Enden
* **Aktivitätsdiagramm / Programmablaufplan** – Start, Ende, Ablaufende, Aktion, Entscheidung, Ein-/Ausgabe, Unterprogramm, Gabelung/Vereinigung, Verbinder, Swimlanes; Pfeile mit Bedingungen wie `[ja]`
* **Anwendungsfalldiagramm** – Akteure, Anwendungsfälle, Systemgrenze, «include», «extend», Vererbung
* **Zustandsdiagramm** – Start-/Endzustand, Zustände mit entry/do/exit, Entscheidungen, zusammengesetzte Zustände, Übergänge mit Beschriftung, Schleifen auf denselben Zustand
* **Sequenzdiagramm** – Objekte/Lebenslinien, Akteure, synchrone/asynchrone Nachrichten, Antworten, Selbstaufrufe, automatische Aktivierungsbalken, Fragmente (loop/alt); Nachrichten ordnen sich automatisch untereinander an und lassen sich per Ziehen oder Knopf umsortieren
* in allen Diagrammen: Notizen (mit Zeilenumbruch), freier Text, Rahmen, Füllfarben

Bedienung:

* Form per Klick in der Formenliste oder mit den Tasten `1`–`9` einfügen – sie wird automatisch unter bzw. neben der ausgewählten Form platziert, der Name ist sofort tippbar; `Enter` springt zurück zum Diagramm
* Verbinden: Form auswählen und mit `Shift`+Klick die Zielform anklicken, oder `V` / „Verbinden“ und nacheinander Start- und Zielform anklicken. „Auto-Verbinden“ hängt jede neue Form an die ausgewählte (für Abläufe)
* Texte, Verbindungsart, Beschriftungen, Multiplizitäten, Größe und Farbe werden rechts in normalen Eingabefeldern bearbeitet
* Pfeiltasten verschieben, `Tab` wandert durch die Formen, `Entf` löscht, `Strg+Z`/`Strg+Y`, `Strg+C`/`V`/`D` (auch zwischen zwei Diagrammen), Mehrfachauswahl mit `Strg`+Klick oder `Shift`+Ziehen, Ausrichten und Verteilen
* „Anordnen“ (`L`) legt alle Formen automatisch in Schichten an (Oberklassen oben, Abläufe von oben nach unten oder links nach rechts)
* Zwei-Finger-Wischen verschiebt die Ansicht, `Strg`+Scrollen oder Zusammenziehen zoomt, `F` zeigt alles
* Export als **SVG** oder **PNG** (weißer Hintergrund, druckfertig), `?` zeigt alle Tastenkürzel

Die Datei ist lesbares JSON (`knoten`, `kanten`), passt also gut in Git.

## Bekannte Einschränkungen

* Nur `.xlsx`; `.xls`, `.ods` und `.csv` werden nicht geöffnet.
* Sehr große Tabellen (mehrere hunderttausend Zellen) brauchen beim Öffnen und Speichern spürbar Zeit, weil die Datei komplett übersetzt wird.
* UML: Verbindungen laufen gerade oder rechtwinklig zwischen den Formen, eigene Knickpunkte gibt es nicht. Import/Export von PlantUML oder XMI ist nicht vorgesehen.
