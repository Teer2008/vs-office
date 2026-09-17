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

## Bekannte Einschränkungen

* Nur `.xlsx`; `.xls`, `.ods` und `.csv` werden nicht geöffnet.
* Sehr große Tabellen (mehrere hunderttausend Zellen) brauchen beim Öffnen und Speichern spürbar Zeit, weil die Datei komplett übersetzt wird.
