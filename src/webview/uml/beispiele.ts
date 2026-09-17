// Kleine Beispieldiagramme, die der Nutzer per Klick laden kann
import type { Diagramm, DiagrammTyp, Kante, KantenArt, Knoten, KnotenArt } from './modell';
import { leeresDiagramm } from './modell';
import { masse } from './geometrie';

type K = Partial<Knoten> & { id: string; art: KnotenArt; x: number; y: number; name: string };

function bauen(typ: DiagrammTyp, titel: string, knoten: K[], kanten: [string, string, KantenArt, Partial<Kante>?][]): Diagramm {
  const d = leeresDiagramm(typ, titel);
  d.knoten = knoten.map(k => ({ ...k }));
  d.kanten = kanten.map(([von, nach, art, rest], i) => ({ id: `e${i + 1}`, von, nach, art, ...(rest ?? {}) }));
  return d;
}

/** Richtet Knoten waagerecht mittig auf x aus (x im Beispiel = gewünschte Mitte) */
function zentrieren(d: Diagramm, ids: string[]): void {
  for (const k of d.knoten) {
    if (ids.includes(k.id)) {
      k.x = Math.round((k.x - masse(k).w / 2) / 10) * 10;
    }
  }
}

export function beispiel(typ: DiagrammTyp): Diagramm {
  switch (typ) {
    case 'klasse':
      return bauen('klasse', 'Schule', [
        { id: 'person', art: 'klasse', x: 240, y: 40, name: 'Person', abstrakt: true, zeilen: ['- name: String', '- geburtsjahr: int'], methoden: ['+ getName(): String', '+ getAlter(): int'] },
        { id: 'schueler', art: 'klasse', x: 80, y: 220, name: 'Schüler', zeilen: ['- klasse: String'], methoden: ['+ getKlasse(): String'] },
        { id: 'lehrer', art: 'klasse', x: 400, y: 220, name: 'Lehrer', zeilen: ['- faecher: List<String>'], methoden: ['+ unterrichtet(f: String): boolean'] },
        { id: 'kurs', art: 'klasse', x: 400, y: 400, name: 'Kurs', zeilen: ['- fach: String', '- raum: String'], methoden: ['+ anmelden(s: Schüler): void'] },
        { id: 'vgl', art: 'schnittstelle', x: 620, y: 40, name: 'Comparable', methoden: ['+ compareTo(o): int'] },
        { id: 'notiz', art: 'notiz', x: 40, y: 40, name: 'Abstrakte Klassen', zeilen: ['werden kursiv', 'geschrieben.'], w: 150 },
      ], [
        ['schueler', 'person', 'vererbung'],
        ['lehrer', 'person', 'vererbung'],
        ['person', 'vgl', 'realisierung'],
        ['lehrer', 'kurs', 'assoziation', { text: 'leitet', vonText: '1', nachText: '*' }],
        ['kurs', 'schueler', 'aggregation', { text: 'Teilnehmer', vonText: '*', nachText: '*' }],
        ['notiz', 'person', 'notizLinie'],
      ]);
    case 'aktivitaet': {
      const d = bauen('aktivitaet', 'Zahl raten', [
        { id: 'start', art: 'start', x: 230, y: 30, name: '' },
        { id: 'a1', art: 'aktion', x: 230, y: 100, name: 'Zufallszahl wählen' },
        { id: 'e1', art: 'eingabe', x: 230, y: 190, name: 'Tipp eingeben' },
        { id: 'd1', art: 'entscheidung', x: 230, y: 280, name: 'Tipp = Zahl?' },
        { id: 'a2', art: 'eingabe', x: 480, y: 285, name: 'Hinweis ausgeben' },
        { id: 'a3', art: 'eingabe', x: 230, y: 400, name: '„Richtig!“ ausgeben' },
        { id: 'ende', art: 'ende', x: 230, y: 490, name: '' },
      ], [
        ['start', 'a1', 'pfeil'],
        ['a1', 'e1', 'pfeil'],
        ['e1', 'd1', 'pfeil'],
        ['d1', 'a2', 'pfeil', { text: '[nein]' }],
        ['a2', 'e1', 'pfeil'],
        ['d1', 'a3', 'pfeil', { text: '[ja]' }],
        ['a3', 'ende', 'pfeil'],
      ]);
      zentrieren(d, ['start', 'a1', 'e1', 'd1', 'a3', 'ende']);
      return d;
    }
    case 'anwendungsfall':
      return bauen('anwendungsfall', 'Bibliothek', [
        { id: 'sys', art: 'rahmen', x: 220, y: 30, name: 'Schulbibliothek', w: 480, h: 300 },
        { id: 'schueler', art: 'akteur', x: 60, y: 140, name: 'Schüler' },
        { id: 'bib', art: 'akteur', x: 770, y: 140, name: 'Bibliothekar' },
        { id: 'ausleihen', art: 'anwendungsfall', x: 250, y: 70, name: 'Buch ausleihen' },
        { id: 'pruefen', art: 'anwendungsfall', x: 520, y: 70, name: 'Ausweis prüfen' },
        { id: 'suchen', art: 'anwendungsfall', x: 250, y: 160, name: 'Buch suchen' },
        { id: 'mahnen', art: 'anwendungsfall', x: 250, y: 250, name: 'Mahnung senden' },
      ], [
        ['schueler', 'ausleihen', 'assoziation'],
        ['schueler', 'suchen', 'assoziation'],
        ['bib', 'mahnen', 'assoziation'],
        ['bib', 'ausleihen', 'assoziation'],
        ['ausleihen', 'pruefen', 'include'],
      ]);
    case 'zustand':
      return bauen('zustand', 'Ampel', [
        { id: 's0', art: 'startzustand', x: 58, y: 40, name: '' },
        { id: 'rot', art: 'zustand', x: 20, y: 120, name: 'Rot', zeilen: ['entry / rotes Licht an'] },
        { id: 'rotgelb', art: 'zustand', x: 260, y: 120, name: 'Rot-Gelb' },
        { id: 'gruen', art: 'zustand', x: 260, y: 260, name: 'Grün' },
        { id: 'gelb', art: 'zustand', x: 20, y: 260, name: 'Gelb' },
        { id: 'aus', art: 'endzustand', x: 56, y: 380, name: '' },
      ], [
        ['s0', 'rot', 'pfeil'],
        ['rot', 'rotgelb', 'pfeil', { text: 'nach 30 s' }],
        ['rotgelb', 'gruen', 'pfeil', { text: 'nach 2 s' }],
        ['gruen', 'gelb', 'pfeil', { text: 'nach 25 s' }],
        ['gelb', 'rot', 'pfeil', { text: 'nach 3 s' }],
        ['gelb', 'aus', 'pfeil', { text: 'ausschalten' }],
      ]);
    case 'sequenz':
      return bauen('sequenz', 'Anmeldung', [
        { id: 'nutzer', art: 'akteur', x: 40, y: 40, name: 'Nutzer' },
        { id: 'ui', art: 'lebenslinie', x: 200, y: 40, name: 'ui : Anmeldefenster' },
        { id: 'ctrl', art: 'lebenslinie', x: 420, y: 40, name: 'ctrl : Login' },
        { id: 'db', art: 'lebenslinie', x: 620, y: 40, name: 'db : Datenbank' },
      ], [
        ['nutzer', 'ui', 'nachricht', { text: 'anmelden(name, pw)' }],
        ['ui', 'ctrl', 'nachricht', { text: 'pruefen(name, pw)' }],
        ['ctrl', 'db', 'nachricht', { text: 'findeNutzer(name)' }],
        ['db', 'ctrl', 'antwort', { text: 'nutzer' }],
        ['ctrl', 'ctrl', 'nachricht', { text: 'hashVergleichen()' }],
        ['ctrl', 'ui', 'antwort', { text: 'ok' }],
        ['ui', 'nutzer', 'asynchron', { text: 'Startseite anzeigen' }],
      ]);
    default:
      return bauen('frei', 'Übersicht', [
        { id: 'a', art: 'aktion', x: 60, y: 60, name: 'Idee' },
        { id: 'b', art: 'aktion', x: 260, y: 60, name: 'Planung' },
        { id: 'c', art: 'aktion', x: 460, y: 60, name: 'Umsetzung' },
        { id: 'n', art: 'notiz', x: 260, y: 160, name: 'Notizen sind überall möglich', w: 200 },
      ], [
        ['a', 'b', 'pfeil'],
        ['b', 'c', 'pfeil'],
        ['n', 'b', 'notizLinie'],
      ]);
  }
}
