// Maße der Formen, Randpunkte und Linienführung der Kanten. Alles reine Rechnerei ohne DOM-Zugriff
// (bis auf die Textmessung über ein unsichtbares Canvas).
import type { Diagramm, Kante, KantenArt, Knoten, Linienfuehrung } from './modell';
import { freieGroesse, istNachricht } from './modell';

export const SCHRIFT = "13px 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";
export const SCHRIFT_FAMILIE = "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";
export const ZEILE = 17;
export const RASTER = 10;

export interface Punkt { x: number; y: number; }
export interface Rechteck { x: number; y: number; w: number; h: number; }

let messer: CanvasRenderingContext2D | null = null;
const messCache = new Map<string, number>();

export function textBreite(text: string, fett = false, kursiv = false): number {
  const key = `${fett ? 'b' : ''}${kursiv ? 'i' : ''}|${text}`;
  const bekannt = messCache.get(key);
  if (bekannt !== undefined) {
    return bekannt;
  }
  if (!messer) {
    messer = document.createElement('canvas').getContext('2d');
  }
  if (!messer) {
    return text.length * 7;
  }
  messer.font = `${kursiv ? 'italic ' : ''}${fett ? 'bold ' : ''}${SCHRIFT}`;
  const breite = messer.measureText(text).width;
  messCache.set(key, breite);
  return breite;
}

export function zeilenVon(text: string): string[] {
  return text.split('\n');
}

/** Bricht Zeilen an Wortgrenzen um, damit sie in `breite` passen (für Notizen mit fester Breite) */
export function umbrechen(zeilen: string[], breite: number): string[] {
  const ergebnis: string[] = [];
  for (const zeile of zeilen) {
    if (textBreite(zeile) <= breite) {
      ergebnis.push(zeile);
      continue;
    }
    let aktuell = '';
    for (const wort of zeile.split(' ')) {
      const versuch = aktuell ? `${aktuell} ${wort}` : wort;
      if (textBreite(versuch) <= breite || !aktuell) {
        aktuell = versuch;
      } else {
        ergebnis.push(aktuell);
        aktuell = wort;
      }
    }
    ergebnis.push(aktuell);
  }
  return ergebnis;
}

/** Sichtbare Zeilen einer Notiz (Name + weitere Zeilen, umgebrochen) */
export function notizZeilen(k: Knoten): string[] {
  return umbrechen([...zeilenVon(k.name), ...(k.zeilen ?? [])], (k.w ?? 160) - 24);
}

function maxBreite(zeilen: string[], fett = false, kursiv = false): number {
  let m = 0;
  for (const z of zeilen) {
    m = Math.max(m, textBreite(z, fett, kursiv));
  }
  return m;
}

/** Sichtbare Größe eines Knotens (bei Formen mit freier Größe die gespeicherte, sonst aus dem Inhalt) */
export function masse(k: Knoten): { w: number; h: number } {
  const zeilen = zeilenVon(k.name);
  const nameBreite = maxBreite(zeilen, true, !!k.abstrakt);
  const nameHoehe = zeilen.length * ZEILE;
  switch (k.art) {
    case 'klasse':
    case 'schnittstelle':
    case 'aufzaehlung': {
      const attribute = k.zeilen ?? [];
      const methoden = k.methoden ?? [];
      const stereotyp = k.stereotyp || (k.art === 'schnittstelle' ? 'interface' : k.art === 'aufzaehlung' ? 'enumeration' : '');
      const w = Math.max(120, nameBreite + 24, maxBreite(attribute) + 20, maxBreite(methoden) + 20,
        stereotyp ? textBreite(`«${stereotyp}»`) + 24 : 0, k.w ?? 0);
      const kopf = nameHoehe + 14 + (stereotyp ? ZEILE - 2 : 0);
      const abschnitt = (n: number) => (n === 0 ? 10 : n * ZEILE + 8);
      const h = kopf + abschnitt(attribute.length) + (k.art === 'aufzaehlung' ? 0 : abschnitt(methoden.length));
      return { w, h };
    }
    case 'aktion':
    case 'unterprogramm':
      return { w: Math.max(100, nameBreite + (k.art === 'unterprogramm' ? 50 : 30), k.w ?? 0), h: Math.max(40, nameHoehe + 20) };
    case 'eingabe':
      return { w: Math.max(110, nameBreite + 50, k.w ?? 0), h: Math.max(40, nameHoehe + 20) };
    case 'entscheidung': {
      const b = Math.max(60, nameBreite + 40, k.w ?? 0);
      return { w: b, h: Math.max(44, nameHoehe + 30) };
    }
    case 'start':
    case 'startzustand':
      return { w: 24, h: 24 };
    case 'ende':
    case 'endzustand':
      return { w: 28, h: 28 };
    case 'endeAblauf':
      return { w: 24, h: 24 };
    case 'verbinder':
      return { w: 28, h: 28 };
    case 'balken':
      return { w: k.w ?? 140, h: k.h ?? 6 };
    case 'akteur':
      return { w: Math.max(44, nameBreite + 4), h: 56 + nameHoehe };
    case 'anwendungsfall':
      return { w: Math.max(110, nameBreite * 1.35 + 30, k.w ?? 0), h: Math.max(50, nameHoehe + 30) };
    case 'zustand': {
      const aktionen = k.zeilen ?? [];
      return {
        w: Math.max(100, nameBreite + 24, maxBreite(aktionen) + 20, k.w ?? 0),
        h: nameHoehe + 18 + (aktionen.length ? aktionen.length * ZEILE + 8 : 0),
      };
    }
    case 'lebenslinie':
      return { w: Math.max(80, nameBreite + 24, k.w ?? 0), h: Math.max(36, nameHoehe + 18) };
    case 'rahmen':
      return { w: k.w ?? 300, h: k.h ?? 200 };
    case 'notiz':
      return { w: k.w ?? 160, h: Math.max(40, notizZeilen(k).length * ZEILE + 16) };
    case 'text':
      return { w: Math.max(30, nameBreite + 8), h: Math.max(20, nameHoehe + 4) };
    default:
      return { w: Math.max(100, nameBreite + 30), h: Math.max(40, nameHoehe + 20) };
  }
}

export function rechteck(k: Knoten): Rechteck {
  const m = masse(k);
  return { x: k.x, y: k.y, w: m.w, h: m.h };
}

export function mitte(r: Rechteck): Punkt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Geometrische Form für die Randberechnung */
function formVon(k: Knoten): 'kreis' | 'ellipse' | 'raute' | 'rechteck' {
  switch (k.art) {
    case 'start': case 'ende': case 'endeAblauf': case 'startzustand': case 'endzustand': case 'verbinder':
      return 'kreis';
    case 'anwendungsfall':
      return 'ellipse';
    case 'entscheidung':
      return 'raute';
    default:
      return 'rechteck';
  }
}

/** Punkt auf dem Rand von k in Richtung "ziel" (vom Mittelpunkt aus gesehen) */
export function randpunkt(k: Knoten, ziel: Punkt): Punkt {
  const r = rechteck(k);
  const c = mitte(r);
  const dx = ziel.x - c.x;
  const dy = ziel.y - c.y;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return { x: c.x, y: r.y };
  }
  switch (formVon(k)) {
    case 'kreis': {
      const rad = Math.min(r.w, r.h) / 2;
      const len = Math.hypot(dx, dy);
      return { x: c.x + (dx / len) * rad, y: c.y + (dy / len) * rad };
    }
    case 'ellipse': {
      const a = r.w / 2, b = r.h / 2;
      const t = Math.atan2(dy / b, dx / a);
      return { x: c.x + a * Math.cos(t), y: c.y + b * Math.sin(t) };
    }
    case 'raute': {
      const a = r.w / 2, b = r.h / 2;
      // |x|/a + |y|/b = 1
      const s = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
      return { x: c.x + dx * s, y: c.y + dy * s };
    }
    default: {
      const a = r.w / 2, b = r.h / 2;
      const s = Math.min(a / Math.abs(dx || 1e-9), b / Math.abs(dy || 1e-9));
      return { x: c.x + dx * s, y: c.y + dy * s };
    }
  }
}

/** Liegt p innerhalb der Form von k? */
export function innen(k: Knoten, p: Punkt): boolean {
  const r = rechteck(k);
  const c = mitte(r);
  const dx = p.x - c.x, dy = p.y - c.y;
  switch (formVon(k)) {
    case 'kreis': {
      const rad = Math.min(r.w, r.h) / 2;
      return dx * dx + dy * dy <= rad * rad;
    }
    case 'ellipse':
      return (dx * dx) / ((r.w / 2) ** 2) + (dy * dy) / ((r.h / 2) ** 2) <= 1;
    case 'raute':
      return Math.abs(dx) / (r.w / 2) + Math.abs(dy) / (r.h / 2) <= 1;
    default:
      return Math.abs(dx) <= r.w / 2 && Math.abs(dy) <= r.h / 2;
  }
}

/** Punkt, an dem die Strecke von `start` (innerhalb von k) nach `ziel` die Form verlässt */
export function austritt(k: Knoten, start: Punkt, ziel: Punkt): Punkt {
  if (!innen(k, start)) {
    return randpunkt(k, ziel);
  }
  let a = 0, b = 1;
  for (let i = 0; i < 24; i++) {
    const m = (a + b) / 2;
    const p = { x: start.x + (ziel.x - start.x) * m, y: start.y + (ziel.y - start.y) * m };
    if (innen(k, p)) {
      a = m;
    } else {
      b = m;
    }
  }
  return { x: start.x + (ziel.x - start.x) * b, y: start.y + (ziel.y - start.y) * b };
}

export interface KantenStil {
  gestrichelt: boolean;
  anfang: 'keine' | 'raute' | 'rauteGefuellt';
  ende: 'keine' | 'offen' | 'gefuellt' | 'dreieck';
  /** Beschriftung, die immer angezeigt wird */
  festerText?: string;
}

export const KANTEN_STIL: Record<KantenArt, KantenStil> = {
  assoziation: { gestrichelt: false, anfang: 'keine', ende: 'keine' },
  gerichtet: { gestrichelt: false, anfang: 'keine', ende: 'offen' },
  aggregation: { gestrichelt: false, anfang: 'raute', ende: 'keine' },
  komposition: { gestrichelt: false, anfang: 'rauteGefuellt', ende: 'keine' },
  vererbung: { gestrichelt: false, anfang: 'keine', ende: 'dreieck' },
  realisierung: { gestrichelt: true, anfang: 'keine', ende: 'dreieck' },
  abhaengigkeit: { gestrichelt: true, anfang: 'keine', ende: 'offen' },
  pfeil: { gestrichelt: false, anfang: 'keine', ende: 'gefuellt' },
  include: { gestrichelt: true, anfang: 'keine', ende: 'offen', festerText: '«include»' },
  extend: { gestrichelt: true, anfang: 'keine', ende: 'offen', festerText: '«extend»' },
  nachricht: { gestrichelt: false, anfang: 'keine', ende: 'gefuellt' },
  asynchron: { gestrichelt: false, anfang: 'keine', ende: 'offen' },
  antwort: { gestrichelt: true, anfang: 'keine', ende: 'offen' },
  linie: { gestrichelt: false, anfang: 'keine', ende: 'keine' },
  notizLinie: { gestrichelt: true, anfang: 'keine', ende: 'keine' },
};

export interface KantenGeometrie {
  /** Eckpunkte der Linie (inkl. Anfang und Ende, bereits um die Pfeilspitzen gekürzt) */
  punkte: Punkt[];
  /** Ungekürzte Endpunkte für die Pfeilspitzen */
  anfang: Punkt;
  ende: Punkt;
  anfangWinkel: number;
  endeWinkel: number;
  /** Position für die Beschriftung in der Mitte */
  mittelpunkt: Punkt;
  /** Beschriftung linksbündig ab dem Mittelpunkt (Selbst-Nachrichten) */
  textAnker?: 'start';
}

function winkel(a: Punkt, b: Punkt): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function versetzt(p: Punkt, winkelRad: number, abstand: number): Punkt {
  return { x: p.x + Math.cos(winkelRad) * abstand, y: p.y + Math.sin(winkelRad) * abstand };
}

const SPITZE = 12;

function kuerzung(marker: KantenStil['anfang'] | KantenStil['ende']): number {
  switch (marker) {
    case 'dreieck': return SPITZE;
    case 'raute': case 'rauteGefuellt': return SPITZE * 2;
    case 'gefuellt': return SPITZE * 0.7;
    default: return 0;
  }
}

/** Linienzug für eine Kante zwischen zwei Knoten. `versatz` verschiebt parallele Kanten zwischen denselben Knoten. */
export function kantenGeometrie(kante: Kante, von: Knoten, nach: Knoten, linie: Linienfuehrung, versatz: number): KantenGeometrie {
  const stil = KANTEN_STIL[kante.art];
  let punkte: Punkt[];
  if (von.id === nach.id) {
    // Schleife über die rechte obere Ecke
    const r = rechteck(von);
    const a = { x: r.x + r.w - 20, y: r.y };
    const e = { x: r.x + r.w, y: r.y + 20 + versatz };
    punkte = [a, { x: a.x, y: r.y - 30 - versatz }, { x: r.x + r.w + 30 + versatz, y: r.y - 30 - versatz }, { x: r.x + r.w + 30 + versatz, y: e.y }, e];
  } else if (linie === 'rechtwinklig') {
    punkte = rechtwinklig(von, nach, versatz);
  } else {
    const cv = mitte(rechteck(von));
    const cn = mitte(rechteck(nach));
    if (versatz === 0) {
      punkte = [randpunkt(von, cn), randpunkt(nach, cv)];
    } else {
      // parallel zur Mittellinie verschobene Gerade, an beiden Formen abgeschnitten
      const wk = winkel(cv, cn) + Math.PI / 2;
      const p0 = versetzt(cv, wk, versatz);
      const p1 = versetzt(cn, wk, versatz);
      punkte = [austritt(von, p0, p1), austritt(nach, p1, p0)];
    }
  }
  return fertigstellen(punkte, stil);
}

function fertigstellen(punkte: Punkt[], stil: KantenStil): KantenGeometrie {
  const anfang = punkte[0];
  const ende = punkte[punkte.length - 1];
  const anfangWinkel = winkel(punkte[1], punkte[0]);
  const endeWinkel = winkel(punkte[punkte.length - 2], punkte[punkte.length - 1]);
  const gekuerzt = punkte.slice();
  const ka = kuerzung(stil.anfang);
  const ke = kuerzung(stil.ende);
  if (ka) {
    gekuerzt[0] = versetzt(anfang, anfangWinkel + Math.PI, ka);
  }
  if (ke) {
    gekuerzt[gekuerzt.length - 1] = versetzt(ende, endeWinkel + Math.PI, ke);
  }
  return { punkte: gekuerzt, anfang, ende, anfangWinkel, endeWinkel, mittelpunkt: linienMitte(punkte) };
}

function linienMitte(punkte: Punkt[]): Punkt {
  let gesamt = 0;
  for (let i = 1; i < punkte.length; i++) {
    gesamt += Math.hypot(punkte[i].x - punkte[i - 1].x, punkte[i].y - punkte[i - 1].y);
  }
  let rest = gesamt / 2;
  for (let i = 1; i < punkte.length; i++) {
    const l = Math.hypot(punkte[i].x - punkte[i - 1].x, punkte[i].y - punkte[i - 1].y);
    if (rest <= l) {
      const t = l === 0 ? 0 : rest / l;
      return { x: punkte[i - 1].x + (punkte[i].x - punkte[i - 1].x) * t, y: punkte[i - 1].y + (punkte[i].y - punkte[i - 1].y) * t };
    }
    rest -= l;
  }
  return punkte[0];
}

/** Rechtwinklige Führung: Z- bzw. L-förmig, je nachdem, in welcher Richtung die Knoten weiter auseinanderliegen */
function rechtwinklig(von: Knoten, nach: Knoten, versatz: number): Punkt[] {
  const rv = rechteck(von);
  const rn = rechteck(nach);
  const cv = mitte(rv);
  const cn = mitte(rn);
  const dx = cn.x - cv.x;
  const dy = cn.y - cv.y;
  const lueckeX = Math.max(rn.x - (rv.x + rv.w), rv.x - (rn.x + rn.w));
  const lueckeY = Math.max(rn.y - (rv.y + rv.h), rv.y - (rn.y + rn.h));
  if (lueckeY >= 20 || (lueckeX < 20 && Math.abs(dy) >= Math.abs(dx))) {
    // vertikal: unten/oben raus, in der Mitte waagerecht
    const startY = dy > 0 ? rv.y + rv.h : rv.y;
    const endY = dy > 0 ? rn.y : rn.y + rn.h;
    const mittelY = (startY + endY) / 2 + versatz;
    const startX = cv.x + versatz;
    const endX = cn.x + versatz;
    const start = randpunkt(von, { x: startX, y: startY + (dy > 0 ? 1000 : -1000) });
    const ziel = randpunkt(nach, { x: endX, y: endY + (dy > 0 ? -1000 : 1000) });
    if (Math.abs(start.x - ziel.x) < 1) {
      return [start, ziel];
    }
    return [start, { x: start.x, y: mittelY }, { x: ziel.x, y: mittelY }, ziel];
  }
  const startX = dx > 0 ? rv.x + rv.w : rv.x;
  const endX = dx > 0 ? rn.x : rn.x + rn.w;
  const mittelX = (startX + endX) / 2 + versatz;
  const start = randpunkt(von, { x: startX + (dx > 0 ? 1000 : -1000), y: cv.y + versatz });
  const ziel = randpunkt(nach, { x: endX + (dx > 0 ? -1000 : 1000), y: cn.y + versatz });
  if (Math.abs(start.y - ziel.y) < 1) {
    return [start, ziel];
  }
  return [start, { x: mittelX, y: start.y }, { x: mittelX, y: ziel.y }, ziel];
}

/** Pfeilspitze als SVG-Pfad (Polygon), die auf `p` mit Richtung `winkelRad` zeigt */
export function spitzenPfad(art: KantenStil['anfang'] | KantenStil['ende'], p: Punkt, winkelRad: number): string {
  const z = (pt: Punkt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  switch (art) {
    case 'offen': {
      const a = versetzt(p, winkelRad + Math.PI - 0.45, SPITZE);
      const b = versetzt(p, winkelRad + Math.PI + 0.45, SPITZE);
      return `M${z(a)} L${z(p)} L${z(b)}`;
    }
    case 'gefuellt': {
      const a = versetzt(p, winkelRad + Math.PI - 0.4, SPITZE);
      const b = versetzt(p, winkelRad + Math.PI + 0.4, SPITZE);
      return `M${z(a)} L${z(p)} L${z(b)} Z`;
    }
    case 'dreieck': {
      const a = versetzt(p, winkelRad + Math.PI - 0.5, SPITZE * 1.2);
      const b = versetzt(p, winkelRad + Math.PI + 0.5, SPITZE * 1.2);
      return `M${z(a)} L${z(p)} L${z(b)} Z`;
    }
    case 'raute':
    case 'rauteGefuellt': {
      const a = versetzt(p, winkelRad + Math.PI - 0.5, SPITZE);
      const m = versetzt(p, winkelRad + Math.PI, SPITZE * 2);
      const b = versetzt(p, winkelRad + Math.PI + 0.5, SPITZE);
      return `M${z(p)} L${z(a)} L${z(m)} L${z(b)} Z`;
    }
    default:
      return '';
  }
}

export function pfad(punkte: Punkt[]): string {
  return punkte.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function amRaster(wert: number, raster = RASTER): number {
  return Math.round(wert / raster) * raster;
}

/** Abstand eines Punkts zu einem Linienzug */
export function abstandZuLinie(p: Punkt, punkte: Punkt[]): number {
  let best = Infinity;
  for (let i = 1; i < punkte.length; i++) {
    const a = punkte[i - 1], b = punkte[i];
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    let t = l2 === 0 ? 0 : ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))));
  }
  return best;
}

export function ueberlappt(a: Rechteck, b: Rechteck, rand = 0): boolean {
  return a.x < b.x + b.w + rand && a.x + a.w + rand > b.x && a.y < b.y + b.h + rand && a.y + a.h + rand > b.y;
}

/** Umschließendes Rechteck aller Knoten (und der Lebenslinien im Sequenzdiagramm) */
export function diagrammGrenzen(d: Diagramm): Rechteck | null {
  if (d.knoten.length === 0) {
    return null;
  }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const seq = d.typ === 'sequenz' ? sequenzMasse(d) : null;
  for (const k of d.knoten) {
    const r = rechteck(k);
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, seq && (k.art === 'lebenslinie' || k.art === 'akteur') ? seq.unten : r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// ---------- Sequenzdiagramm ----------

export const SEQ_KOPF_Y = 40;
export const SEQ_ZEILE = 44;

export interface SequenzMasse {
  /** y-Koordinate, ab der Nachrichten beginnen */
  oben: number;
  /** y der Nachricht mit Index i */
  y: (index: number) => number;
  /** Ende der Lebenslinien */
  unten: number;
  nachrichten: Kante[];
}

/** Lebenslinien stehen alle auf derselben Höhe; Nachrichten liegen in der Reihenfolge der Kantenliste untereinander */
export function sequenzMasse(d: Diagramm): SequenzMasse {
  const nachrichten = d.kanten.filter(k => istNachricht(k.art));
  let kopfUnten = SEQ_KOPF_Y;
  for (const k of d.knoten) {
    if (k.art === 'lebenslinie' || k.art === 'akteur') {
      kopfUnten = Math.max(kopfUnten, k.y + masse(k).h);
    }
  }
  const oben = kopfUnten + 30;
  const y = (i: number) => oben + i * SEQ_ZEILE;
  return { oben, y, unten: y(nachrichten.length) + 20, nachrichten };
}

/** x-Koordinate der Lebenslinie eines Knotens */
export function lebenslinieX(k: Knoten): number {
  return k.x + masse(k).w / 2;
}

export function nachrichtGeometrie(
  kante: Kante, index: number, von: Knoten, nach: Knoten, seq: SequenzMasse,
  aktiv: (knotenId: string, y: number) => boolean,
): KantenGeometrie {
  const stil = KANTEN_STIL[kante.art];
  const y = seq.y(index);
  const xv = lebenslinieX(von);
  const xn = lebenslinieX(nach);
  // Pfeile beginnen und enden am Rand des Aktivierungsbalkens, falls dort einer ist
  const randV = aktiv(von.id, y) ? 5 : 0;
  const randN = aktiv(nach.id, y) ? 5 : 0;
  if (von.id === nach.id) {
    const punkte = [{ x: xv + randV, y }, { x: xv + 40, y }, { x: xv + 40, y: y + 22 }, { x: xv + randV + 1, y: y + 22 }];
    const geo = fertigstellen(punkte, stil);
    geo.mittelpunkt = { x: xv + 48, y: y + 23 };
    geo.textAnker = 'start';
    return geo;
  }
  const richtung = xn > xv ? 1 : -1;
  return fertigstellen([{ x: xv + richtung * randV, y }, { x: xn - richtung * randN, y }], stil);
}

/** Aktivierungsbalken: eine synchrone Nachricht aktiviert das Ziel bis zur passenden Antwort (oder kurz danach) */
export function aktivierungen(d: Diagramm, seq: SequenzMasse): { knotenId: string; von: number; bis: number }[] {
  const ergebnis: { knotenId: string; von: number; bis: number }[] = [];
  seq.nachrichten.forEach((n, i) => {
    if (n.art !== 'nachricht' || n.von === n.nach) {
      return;
    }
    let bis = seq.y(i) + SEQ_ZEILE * 0.6;
    for (let j = i + 1; j < seq.nachrichten.length; j++) {
      const m = seq.nachrichten[j];
      if (m.art === 'antwort' && m.von === n.nach && m.nach === n.von) {
        bis = seq.y(j);
        break;
      }
    }
    ergebnis.push({ knotenId: n.nach, von: seq.y(i), bis });
  });
  return ergebnis;
}

export { freieGroesse };
