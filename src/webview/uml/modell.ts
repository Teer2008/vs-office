// Datenmodell des UML-Editors. Wird so als JSON in der .uml-Datei gespeichert.

export type DiagrammTyp = 'klasse' | 'aktivitaet' | 'anwendungsfall' | 'zustand' | 'sequenz' | 'frei';
export type Linienfuehrung = 'gerade' | 'rechtwinklig';
export type Layoutrichtung = 'oben' | 'links';

export type KnotenArt =
  // Klassendiagramm
  | 'klasse' | 'schnittstelle' | 'aufzaehlung'
  // Aktivitätsdiagramm / Programmablaufplan
  | 'start' | 'ende' | 'endeAblauf' | 'aktion' | 'entscheidung' | 'balken' | 'eingabe' | 'unterprogramm' | 'verbinder'
  // Anwendungsfalldiagramm
  | 'akteur' | 'anwendungsfall'
  // Zustandsdiagramm
  | 'zustand' | 'startzustand' | 'endzustand'
  // Sequenzdiagramm
  | 'lebenslinie'
  // Allgemein
  | 'rahmen' | 'notiz' | 'text';

export type KantenArt =
  | 'assoziation' | 'gerichtet' | 'aggregation' | 'komposition' | 'vererbung' | 'realisierung' | 'abhaengigkeit'
  | 'pfeil' | 'include' | 'extend'
  | 'nachricht' | 'asynchron' | 'antwort'
  | 'linie' | 'notizLinie';

export interface Knoten {
  id: string;
  art: KnotenArt;
  x: number;
  y: number;
  /** Nur für Formen mit freier Größe (Rahmen, Notiz, Balken); sonst wird die Größe aus dem Inhalt berechnet */
  w?: number;
  h?: number;
  name: string;
  /** Attribute (Klasse), Aktionen (Zustand), Inhalt (Notiz/Rahmen) - eine Zeile pro Eintrag */
  zeilen?: string[];
  /** Methoden (Klasse) */
  methoden?: string[];
  stereotyp?: string;
  abstrakt?: boolean;
  farbe?: string;
}

export interface Kante {
  id: string;
  art: KantenArt;
  von: string;
  nach: string;
  text?: string;
  vonText?: string;
  nachText?: string;
  linie?: Linienfuehrung;
}

export interface Diagramm {
  version: 1;
  typ: DiagrammTyp;
  titel: string;
  raster: boolean;
  linie: Linienfuehrung;
  richtung: Layoutrichtung;
  knoten: Knoten[];
  kanten: Kante[];
}

export const DIAGRAMM_TYPEN: { typ: DiagrammTyp; name: string }[] = [
  { typ: 'klasse', name: 'Klassendiagramm' },
  { typ: 'aktivitaet', name: 'Aktivitätsdiagramm / Programmablauf' },
  { typ: 'anwendungsfall', name: 'Anwendungsfalldiagramm' },
  { typ: 'zustand', name: 'Zustandsdiagramm' },
  { typ: 'sequenz', name: 'Sequenzdiagramm' },
  { typ: 'frei', name: 'Freies Diagramm' },
];

export interface KnotenDefinition {
  art: KnotenArt;
  name: string;
  /** Text, mit dem eine neue Form eingefügt wird */
  standardName: string;
  /** Formen mit freier Größe bekommen beim Einfügen diese Maße */
  w?: number;
  h?: number;
  /** Form ist ein Behälter und wird hinter allen anderen gezeichnet */
  hintergrund?: boolean;
  /** Name wird nicht angezeigt (Start, Ende, Balken) */
  ohneName?: boolean;
}

export interface Palettengruppe {
  typ: DiagrammTyp;
  name: string;
  formen: KnotenDefinition[];
  kanten: KantenArt[];
  /** Kantenart, die beim Verbinden vorausgewählt ist */
  standardKante: KantenArt;
  /** Neue Formen automatisch mit der Auswahl verbinden */
  autoVerbinden: boolean;
  richtung: Layoutrichtung;
}

export const PALETTE: Palettengruppe[] = [
  {
    typ: 'klasse', name: 'Klassendiagramm',
    formen: [
      { art: 'klasse', name: 'Klasse', standardName: 'Klasse' },
      { art: 'schnittstelle', name: 'Schnittstelle', standardName: 'Schnittstelle' },
      { art: 'aufzaehlung', name: 'Aufzählung', standardName: 'Aufzählung' },
      { art: 'rahmen', name: 'Paket', standardName: 'Paket', w: 320, h: 220, hintergrund: true },
      { art: 'notiz', name: 'Notiz', standardName: 'Notiz', w: 160 },
    ],
    kanten: ['assoziation', 'gerichtet', 'aggregation', 'komposition', 'vererbung', 'realisierung', 'abhaengigkeit', 'notizLinie'],
    standardKante: 'assoziation', autoVerbinden: false, richtung: 'oben',
  },
  {
    typ: 'aktivitaet', name: 'Aktivität / Programmablauf',
    formen: [
      { art: 'start', name: 'Start', standardName: 'Start', ohneName: true },
      { art: 'aktion', name: 'Aktion / Anweisung', standardName: 'Aktion' },
      { art: 'entscheidung', name: 'Entscheidung', standardName: 'Bedingung?' },
      { art: 'eingabe', name: 'Ein-/Ausgabe', standardName: 'Eingabe' },
      { art: 'unterprogramm', name: 'Unterprogramm', standardName: 'Unterprogramm' },
      { art: 'balken', name: 'Gabelung', standardName: '', w: 140, h: 6, ohneName: true },
      { art: 'ende', name: 'Ende', standardName: 'Ende', ohneName: true },
      { art: 'endeAblauf', name: 'Ablaufende', standardName: '', ohneName: true },
      { art: 'verbinder', name: 'Verbinder', standardName: 'A' },
      { art: 'rahmen', name: 'Bereich (Swimlane)', standardName: 'Bereich', w: 260, h: 400, hintergrund: true },
      { art: 'notiz', name: 'Notiz', standardName: 'Notiz', w: 160 },
    ],
    kanten: ['pfeil', 'linie', 'notizLinie'],
    standardKante: 'pfeil', autoVerbinden: true, richtung: 'oben',
  },
  {
    typ: 'anwendungsfall', name: 'Anwendungsfall',
    formen: [
      { art: 'akteur', name: 'Akteur', standardName: 'Akteur' },
      { art: 'anwendungsfall', name: 'Anwendungsfall', standardName: 'Anwendungsfall' },
      { art: 'rahmen', name: 'System', standardName: 'System', w: 320, h: 300, hintergrund: true },
      { art: 'notiz', name: 'Notiz', standardName: 'Notiz', w: 160 },
    ],
    kanten: ['assoziation', 'include', 'extend', 'vererbung', 'notizLinie'],
    standardKante: 'assoziation', autoVerbinden: false, richtung: 'links',
  },
  {
    typ: 'zustand', name: 'Zustandsdiagramm',
    formen: [
      { art: 'startzustand', name: 'Startzustand', standardName: '', ohneName: true },
      { art: 'zustand', name: 'Zustand', standardName: 'Zustand' },
      { art: 'entscheidung', name: 'Entscheidung', standardName: '' },
      { art: 'endzustand', name: 'Endzustand', standardName: '', ohneName: true },
      { art: 'rahmen', name: 'Zusammengesetzt', standardName: 'Zustand', w: 300, h: 200, hintergrund: true },
      { art: 'notiz', name: 'Notiz', standardName: 'Notiz', w: 160 },
    ],
    kanten: ['pfeil', 'notizLinie'],
    standardKante: 'pfeil', autoVerbinden: true, richtung: 'oben',
  },
  {
    typ: 'sequenz', name: 'Sequenzdiagramm',
    formen: [
      { art: 'lebenslinie', name: 'Objekt / Lebenslinie', standardName: 'objekt : Klasse' },
      { art: 'akteur', name: 'Akteur', standardName: 'Akteur' },
      { art: 'rahmen', name: 'Fragment (loop/alt)', standardName: 'loop', w: 300, h: 120 },
      { art: 'notiz', name: 'Notiz', standardName: 'Notiz', w: 160 },
    ],
    kanten: ['nachricht', 'asynchron', 'antwort'],
    standardKante: 'nachricht', autoVerbinden: false, richtung: 'links',
  },
  {
    typ: 'frei', name: 'Allgemein',
    formen: [
      { art: 'aktion', name: 'Kasten', standardName: 'Text' },
      { art: 'text', name: 'Freier Text', standardName: 'Text' },
      { art: 'notiz', name: 'Notiz', standardName: 'Notiz', w: 160 },
      { art: 'rahmen', name: 'Rahmen', standardName: 'Rahmen', w: 300, h: 200, hintergrund: true },
    ],
    kanten: ['linie', 'pfeil', 'gerichtet', 'notizLinie'],
    standardKante: 'pfeil', autoVerbinden: false, richtung: 'oben',
  },
];

export const KANTEN_NAMEN: Record<KantenArt, string> = {
  assoziation: 'Assoziation',
  gerichtet: 'Gerichtete Assoziation',
  aggregation: 'Aggregation',
  komposition: 'Komposition',
  vererbung: 'Vererbung',
  realisierung: 'Realisierung',
  abhaengigkeit: 'Abhängigkeit',
  pfeil: 'Pfeil / Übergang',
  include: '«include»',
  extend: '«extend»',
  nachricht: 'Nachricht (synchron)',
  asynchron: 'Nachricht (asynchron)',
  antwort: 'Antwort',
  linie: 'Linie',
  notizLinie: 'Notiz-Verbindung',
};

/** Alle Kantenarten in der Reihenfolge der Auswahlliste */
export const ALLE_KANTEN = Object.keys(KANTEN_NAMEN) as KantenArt[];

/** Nachschlagen einer Formdefinition (die erste Gruppe, die die Art enthält) */
export function knotenDefinition(art: KnotenArt): KnotenDefinition {
  for (const gruppe of PALETTE) {
    const def = gruppe.formen.find(f => f.art === art);
    if (def) {
      return def;
    }
  }
  return { art, name: art, standardName: art };
}

export function gruppeFuer(typ: DiagrammTyp): Palettengruppe {
  return PALETTE.find(g => g.typ === typ) ?? PALETTE[PALETTE.length - 1];
}

/** Zeichenformen mit vom Nutzer wählbarer Größe */
export function freieGroesse(art: KnotenArt): boolean {
  return art === 'rahmen' || art === 'notiz' || art === 'balken';
}

/** Kanten, deren Pfeilspitze in Richtung "Oberklasse" zeigt: beim Layout kommt das Ziel nach oben */
export function zeigtNachOben(art: KantenArt): boolean {
  return art === 'vererbung' || art === 'realisierung';
}

/** Kanten eines Sequenzdiagramms, die als Nachricht zwischen Lebenslinien gezeichnet werden */
export function istNachricht(art: KantenArt): boolean {
  return art === 'nachricht' || art === 'asynchron' || art === 'antwort';
}

let zaehler = 0;
export function neueId(prefix = 'k'): string {
  zaehler += 1;
  return `${prefix}${Date.now().toString(36)}${zaehler.toString(36)}`;
}

export function leeresDiagramm(typ: DiagrammTyp = 'klasse', titel = ''): Diagramm {
  const gruppe = gruppeFuer(typ);
  return { version: 1, typ, titel, raster: true, linie: 'gerade', richtung: gruppe.richtung, knoten: [], kanten: [] };
}

/** Repariert eingelesene Dateien: fehlende Felder ergänzen, Kanten ohne Knoten entfernen */
export function diagrammPruefen(roh: unknown): Diagramm {
  const d = (roh && typeof roh === 'object' ? roh : {}) as Partial<Diagramm>;
  const typ = DIAGRAMM_TYPEN.some(t => t.typ === d.typ) ? d.typ as DiagrammTyp : 'klasse';
  const ergebnis = leeresDiagramm(typ, typeof d.titel === 'string' ? d.titel : '');
  ergebnis.raster = d.raster !== false;
  ergebnis.linie = d.linie === 'rechtwinklig' ? 'rechtwinklig' : 'gerade';
  ergebnis.richtung = d.richtung === 'links' ? 'links' : d.richtung === 'oben' ? 'oben' : ergebnis.richtung;
  const ids = new Set<string>();
  for (const k of Array.isArray(d.knoten) ? d.knoten : []) {
    if (!k || typeof k !== 'object' || typeof k.id !== 'string' || ids.has(k.id)) {
      continue;
    }
    ids.add(k.id);
    ergebnis.knoten.push({
      id: k.id,
      art: typeof k.art === 'string' ? k.art as KnotenArt : 'aktion',
      x: Number(k.x) || 0,
      y: Number(k.y) || 0,
      w: typeof k.w === 'number' ? k.w : undefined,
      h: typeof k.h === 'number' ? k.h : undefined,
      name: typeof k.name === 'string' ? k.name : '',
      zeilen: Array.isArray(k.zeilen) ? k.zeilen.map(String) : undefined,
      methoden: Array.isArray(k.methoden) ? k.methoden.map(String) : undefined,
      stereotyp: typeof k.stereotyp === 'string' ? k.stereotyp : undefined,
      abstrakt: k.abstrakt === true ? true : undefined,
      farbe: typeof k.farbe === 'string' ? k.farbe : undefined,
    });
  }
  for (const e of Array.isArray(d.kanten) ? d.kanten : []) {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !ids.has(e.von) || !ids.has(e.nach)) {
      continue;
    }
    ergebnis.kanten.push({
      id: e.id,
      art: ALLE_KANTEN.includes(e.art) ? e.art : 'linie',
      von: e.von,
      nach: e.nach,
      text: e.text || undefined,
      vonText: e.vonText || undefined,
      nachText: e.nachText || undefined,
      linie: e.linie === 'rechtwinklig' || e.linie === 'gerade' ? e.linie : undefined,
    });
  }
  return ergebnis;
}

/** Gespeicherte Form: undefined-Felder fallen weg, Reihenfolge der Felder bleibt lesbar */
export function diagrammSerialisieren(d: Diagramm): string {
  return JSON.stringify(d, null, 2) + '\n';
}
