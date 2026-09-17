// Baut aus dem Diagramm SVG-Elemente. Farben kommen aus CSS-Variablen (--uml-*), damit der Editor dem
// VS-Code-Theme folgt; beim Export werden sie durch feste helle Farben ersetzt.
import type { Diagramm, Kante, Knoten } from './modell';
import { istNachricht, knotenDefinition } from './modell';
import {
  aktivierungen, diagrammGrenzen, kantenGeometrie, KANTEN_STIL, lebenslinieX, masse, nachrichtGeometrie, notizZeilen, pfad,
  rechteck, SCHRIFT_FAMILIE, sequenzMasse, spitzenPfad, textBreite, ZEILE, zeilenVon,
  type KantenGeometrie, type Punkt, type Rechteck,
} from './geometrie';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...kinder: (Node | string)[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    e.setAttribute(k, String(v));
  }
  for (const kind of kinder) {
    e.append(kind);
  }
  return e;
}

/** Füllfarben, die der Nutzer einer Form geben kann (Pastell, damit schwarzer Text lesbar bleibt) */
export const FARBEN: { name: string; wert: string }[] = [
  { name: 'Standard', wert: '' },
  { name: 'Gelb', wert: '#fff3b0' },
  { name: 'Blau', wert: '#cfe3ff' },
  { name: 'Grün', wert: '#d3f2d0' },
  { name: 'Rot', wert: '#ffd2d2' },
  { name: 'Lila', wert: '#e6d5ff' },
  { name: 'Orange', wert: '#ffe0c2' },
  { name: 'Grau', wert: '#e4e4e4' },
];

const STIL = {
  fill: 'fill:var(--uml-fill);stroke:var(--uml-stroke);stroke-width:1.5',
  fillNotiz: 'fill:var(--uml-notiz);stroke:var(--uml-stroke);stroke-width:1.5',
  rahmen: 'fill:var(--uml-rahmen);stroke:var(--uml-stroke);stroke-width:1.5',
  voll: 'fill:var(--uml-stroke);stroke:none',
  linie: 'fill:none;stroke:var(--uml-stroke);stroke-width:1.5',
  text: 'fill:var(--uml-text)',
  textDunkel: 'fill:#1e1e1e',
};

function textStil(k: Knoten): string {
  return k.farbe ? STIL.textDunkel : STIL.text;
}

function fuellung(k: Knoten, standard = STIL.fill): string {
  return k.farbe ? `fill:${k.farbe};stroke:var(--uml-stroke);stroke-width:1.5` : standard;
}

/** Mehrzeiliger Text. anker: start|middle|end; y ist die Oberkante der ersten Zeile */
function text(zeilen: string[], x: number, y: number, anker: 'start' | 'middle' | 'end', stil: string, extra: Record<string, string | number> = {}): SVGTextElement {
  const t = el('text', { x, y: y + 13, 'text-anchor': anker, style: `${stil};font-family:${SCHRIFT_FAMILIE};font-size:13px`, ...extra });
  zeilen.forEach((z, i) => {
    t.append(el('tspan', { x, dy: i === 0 ? 0 : ZEILE }, z || ' '));
  });
  return t;
}

function stereotypVon(k: Knoten): string {
  return k.stereotyp || (k.art === 'schnittstelle' ? 'interface' : k.art === 'aufzaehlung' ? 'enumeration' : '');
}

export function knotenZeichnen(k: Knoten, d: Diagramm): SVGGElement {
  const r = rechteck(k);
  const g = el('g', { 'data-knoten': k.id, class: `knoten art-${k.art}` });
  const cx = r.x + r.w / 2;
  const nameZeilen = zeilenVon(k.name);
  const nameH = nameZeilen.length * ZEILE;
  const nameStil = (fett = true) => `${textStil(k)};font-weight:${fett ? 'bold' : 'normal'}${k.abstrakt ? ';font-style:italic' : ''}`;

  switch (k.art) {
    case 'klasse':
    case 'schnittstelle':
    case 'aufzaehlung': {
      g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, style: fuellung(k) }));
      const stereotyp = stereotypVon(k);
      let y = r.y + 7;
      if (stereotyp) {
        g.append(text([`«${stereotyp}»`], cx, y - 2, 'middle', `${textStil(k)};font-size:12px`));
        y += ZEILE - 2;
      }
      g.append(text(nameZeilen, cx, y, 'middle', nameStil()));
      y += nameH + 7;
      g.append(el('line', { x1: r.x, y1: y, x2: r.x + r.w, y2: y, style: STIL.linie }));
      const attribute = k.zeilen ?? [];
      if (attribute.length) {
        g.append(text(attribute, r.x + 10, y + 4, 'start', textStil(k)));
        y += attribute.length * ZEILE + 8;
      } else {
        y += 10;
      }
      if (k.art !== 'aufzaehlung') {
        g.append(el('line', { x1: r.x, y1: y, x2: r.x + r.w, y2: y, style: STIL.linie }));
        const methoden = k.methoden ?? [];
        if (methoden.length) {
          g.append(text(methoden, r.x + 10, y + 4, 'start', textStil(k)));
        }
      }
      break;
    }
    case 'aktion':
      g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 8, style: fuellung(k) }));
      g.append(text(nameZeilen, cx, r.y + (r.h - nameH) / 2, 'middle', textStil(k)));
      break;
    case 'unterprogramm':
      g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, style: fuellung(k) }));
      g.append(el('line', { x1: r.x + 8, y1: r.y, x2: r.x + 8, y2: r.y + r.h, style: STIL.linie }));
      g.append(el('line', { x1: r.x + r.w - 8, y1: r.y, x2: r.x + r.w - 8, y2: r.y + r.h, style: STIL.linie }));
      g.append(text(nameZeilen, cx, r.y + (r.h - nameH) / 2, 'middle', textStil(k)));
      break;
    case 'eingabe': {
      const s = 14;
      g.append(el('polygon', { points: `${r.x + s},${r.y} ${r.x + r.w},${r.y} ${r.x + r.w - s},${r.y + r.h} ${r.x},${r.y + r.h}`, style: fuellung(k) }));
      g.append(text(nameZeilen, cx, r.y + (r.h - nameH) / 2, 'middle', textStil(k)));
      break;
    }
    case 'entscheidung':
      g.append(el('polygon', { points: `${cx},${r.y} ${r.x + r.w},${r.y + r.h / 2} ${cx},${r.y + r.h} ${r.x},${r.y + r.h / 2}`, style: fuellung(k) }));
      if (k.name) {
        g.append(text(nameZeilen, cx, r.y + (r.h - nameH) / 2, 'middle', textStil(k)));
      }
      break;
    case 'start':
    case 'startzustand':
      g.append(el('circle', { cx, cy: r.y + r.h / 2, r: r.w / 2, style: STIL.voll }));
      break;
    case 'ende':
    case 'endzustand':
      g.append(el('circle', { cx, cy: r.y + r.h / 2, r: r.w / 2, style: STIL.fill }));
      g.append(el('circle', { cx, cy: r.y + r.h / 2, r: r.w / 2 - 4, style: STIL.voll }));
      break;
    case 'endeAblauf': {
      const cy = r.y + r.h / 2, rad = r.w / 2, o = rad * 0.6;
      g.append(el('circle', { cx, cy, r: rad, style: STIL.fill }));
      g.append(el('path', { d: `M${cx - o},${cy - o} L${cx + o},${cy + o} M${cx + o},${cy - o} L${cx - o},${cy + o}`, style: STIL.linie }));
      break;
    }
    case 'verbinder':
      g.append(el('circle', { cx, cy: r.y + r.h / 2, r: r.w / 2, style: fuellung(k) }));
      g.append(text([k.name], cx, r.y + (r.h - ZEILE) / 2, 'middle', nameStil()));
      break;
    case 'balken':
      g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, style: STIL.voll }));
      break;
    case 'akteur': {
      const kopfY = r.y + 8;
      g.append(el('circle', { cx, cy: kopfY, r: 7, style: STIL.fill }));
      g.append(el('path', {
        d: `M${cx},${kopfY + 7} L${cx},${kopfY + 28} M${cx - 14},${kopfY + 14} L${cx + 14},${kopfY + 14} M${cx},${kopfY + 28} L${cx - 12},${kopfY + 46} M${cx},${kopfY + 28} L${cx + 12},${kopfY + 46}`,
        style: STIL.linie,
      }));
      g.append(text(nameZeilen, cx, r.y + 56, 'middle', STIL.text));
      // unsichtbare Fläche, damit die Figur gut anklickbar ist
      g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, style: 'fill:transparent;stroke:none' }));
      break;
    }
    case 'anwendungsfall':
      g.append(el('ellipse', { cx, cy: r.y + r.h / 2, rx: r.w / 2, ry: r.h / 2, style: fuellung(k) }));
      g.append(text(nameZeilen, cx, r.y + (r.h - nameH) / 2, 'middle', textStil(k)));
      break;
    case 'zustand': {
      g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 12, style: fuellung(k) }));
      g.append(text(nameZeilen, cx, r.y + 9, 'middle', nameStil()));
      const aktionen = k.zeilen ?? [];
      if (aktionen.length) {
        const y = r.y + nameH + 18;
        g.append(el('line', { x1: r.x, y1: y, x2: r.x + r.w, y2: y, style: STIL.linie }));
        g.append(text(aktionen, r.x + 10, y + 4, 'start', textStil(k)));
      }
      break;
    }
    case 'lebenslinie':
      g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, style: fuellung(k) }));
      g.append(text(nameZeilen, cx, r.y + (r.h - nameH) / 2, 'middle', `${textStil(k)};text-decoration:underline`));
      break;
    case 'rahmen': {
      g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, style: k.farbe ? `fill:${k.farbe};fill-opacity:0.35;stroke:var(--uml-stroke);stroke-width:1.5` : STIL.rahmen }));
      const tabW = Math.max(40, textBreite(k.name, true) + 22);
      const tabH = ZEILE + 6;
      g.append(el('path', {
        d: `M${r.x},${r.y} L${r.x + tabW},${r.y} L${r.x + tabW},${r.y + tabH - 8} L${r.x + tabW - 8},${r.y + tabH} L${r.x},${r.y + tabH} Z`,
        style: STIL.fill,
      }));
      g.append(text([k.name], r.x + 8, r.y + 3, 'start', `${STIL.text};font-weight:bold`));
      if (k.zeilen?.length) {
        g.append(text(k.zeilen, r.x + 8, r.y + tabH + 4, 'start', STIL.text));
      }
      break;
    }
    case 'notiz': {
      const e = 12;
      g.append(el('path', {
        d: `M${r.x},${r.y} L${r.x + r.w - e},${r.y} L${r.x + r.w},${r.y + e} L${r.x + r.w},${r.y + r.h} L${r.x},${r.y + r.h} Z M${r.x + r.w - e},${r.y} L${r.x + r.w - e},${r.y + e} L${r.x + r.w},${r.y + e}`,
        style: fuellung(k, STIL.fillNotiz),
      }));
      g.append(text(notizZeilen(k), r.x + 8, r.y + 8, 'start', textStil(k)));
      break;
    }
    case 'text':
      g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, style: 'fill:transparent;stroke:none' }));
      g.append(text(nameZeilen, cx, r.y + 2, 'middle', STIL.text));
      break;
    default:
      g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, style: fuellung(k) }));
      g.append(text(nameZeilen, cx, r.y + (r.h - nameH) / 2, 'middle', textStil(k)));
  }

  // Lebenslinie unter Objekten und Akteuren im Sequenzdiagramm
  if (d.typ === 'sequenz' && (k.art === 'lebenslinie' || k.art === 'akteur')) {
    const seq = sequenzMasse(d);
    const x = lebenslinieX(k);
    g.append(el('line', { x1: x, y1: r.y + r.h, x2: x, y2: seq.unten, style: `${STIL.linie};stroke-dasharray:6 4` }));
    for (const a of aktivierungen(d, seq)) {
      if (a.knotenId === k.id) {
        g.append(el('rect', { x: x - 5, y: a.von, width: 10, height: Math.max(8, a.bis - a.von), style: STIL.fill }));
      }
    }
  }
  return g;
}

function beschriftung(p: Punkt, inhalt: string, anker: 'start' | 'middle' | 'end' = 'middle'): SVGGElement {
  const zeilen = zeilenVon(inhalt);
  const w = Math.max(...zeilen.map(z => textBreite(z))) + 6;
  const h = zeilen.length * ZEILE + 2;
  const x = anker === 'middle' ? p.x - w / 2 : anker === 'start' ? p.x - 3 : p.x - w + 3;
  const g = el('g', { class: 'kantentext' });
  g.append(el('rect', { x, y: p.y - h / 2, width: w, height: h, rx: 2, style: 'fill:var(--uml-bg);stroke:none' }));
  g.append(text(zeilen, p.x, p.y - h / 2 + 1, anker, STIL.text));
  return g;
}

function kantenDarstellung(kante: Kante, geo: KantenGeometrie): SVGGElement {
  const stil = KANTEN_STIL[kante.art];
  const g = el('g', { 'data-kante': kante.id, class: 'kante' });
  const d = pfad(geo.punkte);
  g.append(el('path', { d, class: 'kanten-treffer', style: 'fill:none;stroke:transparent;stroke-width:16' }));
  g.append(el('path', { d, class: 'kanten-linie', style: `${STIL.linie}${stil.gestrichelt ? ';stroke-dasharray:7 5' : ''}` }));
  if (stil.anfang !== 'keine') {
    g.append(el('path', { d: spitzenPfad(stil.anfang, geo.anfang, geo.anfangWinkel), style: stil.anfang === 'rauteGefuellt' ? STIL.voll + ';stroke:var(--uml-stroke);stroke-width:1.5' : STIL.fill }));
  }
  if (stil.ende !== 'keine') {
    const spitze = spitzenPfad(stil.ende, geo.ende, geo.endeWinkel);
    g.append(el('path', { d: spitze, style: stil.ende === 'offen' ? STIL.linie : stil.ende === 'gefuellt' ? STIL.voll : STIL.fill }));
  }
  const label = [stil.festerText, kante.text].filter(Boolean).join('\n');
  if (label) {
    g.append(beschriftung({ x: geo.mittelpunkt.x, y: geo.mittelpunkt.y - 12 }, label, geo.textAnker ?? 'middle'));
  }
  const endText = (p: Punkt, wk: number, inhalt: string) => {
    // etwas vom Knoten weg und seitlich neben die Linie
    const q = { x: p.x + Math.cos(wk + Math.PI) * 18 + Math.cos(wk + Math.PI / 2) * 12, y: p.y + Math.sin(wk + Math.PI) * 18 + Math.sin(wk + Math.PI / 2) * 12 };
    g.append(beschriftung(q, inhalt));
  };
  if (kante.vonText) {
    endText(geo.anfang, geo.anfangWinkel, kante.vonText);
  }
  if (kante.nachText) {
    endText(geo.ende, geo.endeWinkel, kante.nachText);
  }
  return g;
}

/** Geometrie aller Kanten (wird für Zeichnen und Treffertest gebraucht) */
export function alleKantenGeometrien(d: Diagramm): Map<string, KantenGeometrie> {
  const ergebnis = new Map<string, KantenGeometrie>();
  const knoten = new Map(d.knoten.map(k => [k.id, k]));
  const seq = d.typ === 'sequenz' ? sequenzMasse(d) : null;
  // parallele Kanten zwischen denselben Knoten versetzt zeichnen
  const paare = new Map<string, Kante[]>();
  for (const kante of d.kanten) {
    const key = [kante.von, kante.nach].sort().join('|');
    paare.set(key, [...(paare.get(key) ?? []), kante]);
  }
  let nachrichtIndex = 0;
  const aktive = seq ? aktivierungen(d, seq) : [];
  const istAktiv = (knotenId: string, y: number) => aktive.some(a => a.knotenId === knotenId && y >= a.von && y <= a.bis);
  for (const kante of d.kanten) {
    const von = knoten.get(kante.von);
    const nach = knoten.get(kante.nach);
    if (!von || !nach) {
      continue;
    }
    if (seq && istNachricht(kante.art)) {
      ergebnis.set(kante.id, nachrichtGeometrie(kante, nachrichtIndex++, von, nach, seq, istAktiv));
      continue;
    }
    const gruppe = paare.get([kante.von, kante.nach].sort().join('|')) ?? [kante];
    const i = gruppe.indexOf(kante);
    const versatz = gruppe.length === 1 ? 0 : (i - (gruppe.length - 1) / 2) * 24 * (kante.von <= kante.nach ? 1 : -1);
    ergebnis.set(kante.id, kantenGeometrie(kante, von, nach, kante.linie ?? d.linie, versatz));
  }
  return ergebnis;
}

export interface Gezeichnet {
  gruppe: SVGGElement;
  geometrien: Map<string, KantenGeometrie>;
}

/** Zeichnet das komplette Diagramm in eine Gruppe (Behälter zuerst, dann Kanten, dann restliche Formen) */
export function diagrammZeichnen(d: Diagramm): Gezeichnet {
  const gruppe = el('g', { class: 'diagramm' });
  const hinten = d.knoten.filter(k => knotenDefinition(k.art).hintergrund || k.art === 'rahmen');
  const vorne = d.knoten.filter(k => !hinten.includes(k));
  for (const k of hinten) {
    gruppe.append(knotenZeichnen(k, d));
  }
  const geometrien = alleKantenGeometrien(d);
  for (const kante of d.kanten) {
    const geo = geometrien.get(kante.id);
    if (geo) {
      gruppe.append(kantenDarstellung(kante, geo));
    }
  }
  for (const k of vorne) {
    gruppe.append(knotenZeichnen(k, d));
  }
  return { gruppe, geometrien };
}

const EXPORT_FARBEN: Record<string, string> = {
  '--uml-bg': '#ffffff',
  '--uml-fill': '#ffffff',
  '--uml-notiz': '#fff8c5',
  '--uml-rahmen': '#f7f7f7',
  '--uml-stroke': '#1e1e1e',
  '--uml-text': '#1e1e1e',
};

/** Eigenständiges SVG mit festen Farben und weißem Hintergrund */
export function exportSvg(d: Diagramm, rand = 20): { svg: string; breite: number; hoehe: number } {
  const grenzen: Rechteck = diagrammGrenzen(d) ?? { x: 0, y: 0, w: 200, h: 100 };
  const { gruppe } = diagrammZeichnen(d);
  const alle = gruppe.querySelectorAll<SVGElement>('[style]');
  for (const e of alle) {
    let s = e.getAttribute('style') ?? '';
    for (const [name, wert] of Object.entries(EXPORT_FARBEN)) {
      s = s.split(`var(${name})`).join(wert);
    }
    e.setAttribute('style', s);
  }
  for (const treffer of gruppe.querySelectorAll('.kanten-treffer')) {
    treffer.remove();
  }
  const breite = Math.ceil(grenzen.w + rand * 2 + 40);
  const hoehe = Math.ceil(grenzen.h + rand * 2 + 40);
  const svg = el('svg', {
    xmlns: SVG_NS, width: breite, height: hoehe,
    viewBox: `${grenzen.x - rand - 20} ${grenzen.y - rand - 20} ${breite} ${hoehe}`,
  });
  svg.append(el('rect', { x: grenzen.x - rand - 20, y: grenzen.y - rand - 20, width: breite, height: hoehe, fill: '#ffffff' }));
  svg.append(gruppe);
  return { svg: new XMLSerializer().serializeToString(svg), breite, hoehe };
}

export function exportPng(d: Diagramm, skalierung = 2): Promise<string> {
  const { svg, breite, hoehe } = exportSvg(d);
  return new Promise((resolve, reject) => {
    const bild = new Image();
    bild.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = breite * skalierung;
      canvas.height = hoehe * skalierung;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas nicht verfügbar'));
        return;
      }
      ctx.scale(skalierung, skalierung);
      ctx.drawImage(bild, 0, 0);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    bild.onerror = () => reject(new Error('SVG konnte nicht gerendert werden'));
    bild.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

export { masse };
