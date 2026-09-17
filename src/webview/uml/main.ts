// Läuft in der Webview des UML-Editors. Wird von esbuild nach media/uml/uml.js gebündelt.
import './uml.css';
import {
  ALLE_KANTEN, DIAGRAMM_TYPEN, KANTEN_NAMEN, PALETTE, diagrammPruefen, diagrammSerialisieren, freieGroesse, gruppeFuer,
  istNachricht, knotenDefinition, leeresDiagramm, neueId,
  type Diagramm, type DiagrammTyp, type Kante, type KantenArt, type Knoten, type KnotenArt, type KnotenDefinition,
} from './modell';
import {
  amRaster, diagrammGrenzen, masse, rechteck, ueberlappt, SEQ_KOPF_Y, sequenzMasse,
  type Punkt, type Rechteck,
} from './geometrie';
import { FARBEN, diagrammZeichnen, el, exportPng, exportSvg, knotenZeichnen } from './zeichnen';
import { automatischAnordnen } from './layout';
import { beispiel } from './beispiele';

declare function acquireVsCodeApi(): { postMessage(nachricht: unknown): void };
const vscode = acquireVsCodeApi();

function fehler(was: string, e: unknown): void {
  const text = `${was}: ${(e as Error)?.stack || (e as Error)?.message || e}`;
  console.error(text);
  vscode.postMessage({ type: 'error', text });
}
window.addEventListener('error', e => fehler('Fehler in der Webview', e.error || e.message));
window.addEventListener('unhandledrejection', e => fehler('Fehler in der Webview', e.reason));

// ============================================================
// Zustand
// ============================================================
let modell: Diagramm = leeresDiagramm();
/** Zuletzt festgeschriebener Stand (für Undo und zum Erkennen echter Änderungen) */
let vorher = diagrammSerialisieren(modell);
const undoStapel: string[] = [];
const redoStapel: string[] = [];
let letzterMergeKey: string | null = null;
const auswahl = new Set<string>();
const ansicht = { x: 40, y: 40, zoom: 1 };
/** Verbindungsmodus: 'aus' | 'quelle' (wartet auf Startform) | Knoten-ID der Startform */
let verbinden: string = 'aus';
let autoVerbinden = false;
let kantenArt: KantenArt = 'assoziation';
let zwischenablage: { knoten: Knoten[]; kanten: Kante[] } | null = null;

// ============================================================
// Oberfläche
// ============================================================
document.body.innerHTML = `
<div id="app">
  <div id="werkzeuge">
    <button id="bPalette" title="Formenliste ein-/ausblenden">☰ Formen</button>
    <span class="trenner"></span>
    <button id="bUndo" title="Rückgängig (Strg+Z)">↶ Zurück</button>
    <button id="bRedo" title="Wiederholen (Strg+Y)">↷ Vor</button>
    <span class="trenner"></span>
    <button id="bVerbinden" title="Zwei Formen verbinden: erst die Start-, dann die Zielform anklicken (V)">🔗 Verbinden</button>
    <select id="sKantenArt" title="Art der Verbindung, die beim Verbinden entsteht"></select>
    <label class="umschalter" title="Neue Formen werden automatisch mit der ausgewählten Form verbunden"><input type="checkbox" id="cAuto"> Auto-Verbinden</label>
    <span class="trenner"></span>
    <button id="bLayout" title="Alle Formen automatisch anordnen (L)">⇅ Anordnen</button>
    <span class="trenner"></span>
    <button id="bZoomMinus" title="Verkleinern (−)">−</button>
    <button id="bZoom100" title="Zoom auf 100 % (0)">100 %</button>
    <button id="bZoomPlus" title="Vergrößern (+)">+</button>
    <button id="bAnpassen" title="Alles anzeigen (F)">⤢ Anpassen</button>
    <span class="trenner"></span>
    <button id="bSvg" title="Als SVG-Datei exportieren">SVG</button>
    <button id="bPng" title="Als PNG-Bild exportieren">PNG</button>
    <span class="trenner"></span>
    <button id="bHilfe" title="Hilfe und Tastenkürzel (?)">?</button>
    <button id="bEigenschaften" title="Eigenschaften ein-/ausblenden" style="margin-left:auto">Eigenschaften ☰</button>
  </div>
  <div id="mitte">
    <aside id="palette"></aside>
    <div id="leinwandRahmen">
      <svg id="leinwand" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="rasterMuster" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--uml-raster)" stroke-width="1"/>
          </pattern>
        </defs>
        <g id="welt">
          <rect id="rasterFlaeche" x="-20000" y="-20000" width="40000" height="40000" fill="url(#rasterMuster)"/>
          <g id="inhalt"></g>
          <g id="overlay"></g>
        </g>
      </svg>
      <div id="hilfe" hidden></div>
    </div>
    <aside id="eigenschaften"></aside>
  </div>
  <div id="status"><span id="hinweis"></span><span id="statusRechts"></span></div>
</div>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const leinwand = $('leinwand') as unknown as SVGSVGElement;
const welt = document.getElementById('welt') as unknown as SVGGElement;
const inhalt = document.getElementById('inhalt') as unknown as SVGGElement;
const overlay = document.getElementById('overlay') as unknown as SVGGElement;
const palette = $('palette');
const eigenschaften = $('eigenschaften');
const hinweis = $('hinweis');

// ============================================================
// Hilfsfunktionen
// ============================================================
function knotenMitId(id: string): Knoten | undefined {
  return modell.knoten.find(k => k.id === id);
}
function kanteMitId(id: string): Kante | undefined {
  return modell.kanten.find(k => k.id === id);
}
function ausgewaehlteKnoten(): Knoten[] {
  return modell.knoten.filter(k => auswahl.has(k.id));
}
function ausgewaehlteKanten(): Kante[] {
  return modell.kanten.filter(k => auswahl.has(k.id));
}
function schnappen(wert: number): number {
  return modell.raster ? amRaster(wert) : Math.round(wert);
}
function weltPunkt(ev: { clientX: number; clientY: number }): Punkt {
  const r = leinwand.getBoundingClientRect();
  return { x: (ev.clientX - r.left - ansicht.x) / ansicht.zoom, y: (ev.clientY - r.top - ansicht.y) / ansicht.zoom };
}
function sichtbarerBereich(): Rechteck {
  const r = leinwand.getBoundingClientRect();
  return { x: -ansicht.x / ansicht.zoom, y: -ansicht.y / ansicht.zoom, w: r.width / ansicht.zoom, h: r.height / ansicht.zoom };
}
function inEingabe(ziel: EventTarget | null): boolean {
  const e = ziel as HTMLElement | null;
  return !!e && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.tagName === 'SELECT' || e.isContentEditable);
}
function hinweisSetzen(text: string, wichtig = false): void {
  hinweis.textContent = text;
  hinweis.className = wichtig ? 'wichtig' : '';
}

// ============================================================
// Änderungen, Undo/Redo
// ============================================================
/**
 * Führt eine Änderung am Modell aus und schreibt sie fest. Mit `mergeKey` werden aufeinanderfolgende
 * Änderungen derselben Quelle (z. B. Tippen in einem Feld) zu einem Undo-Schritt zusammengefasst.
 */
function aendern(fn: () => void, mergeKey?: string): void {
  fn();
  const jetzt = diagrammSerialisieren(modell);
  if (jetzt === vorher) {
    zeichnen();
    return;
  }
  if (!(mergeKey && mergeKey === letzterMergeKey)) {
    undoStapel.push(vorher);
    if (undoStapel.length > 200) {
      undoStapel.shift();
    }
    redoStapel.length = 0;
  }
  letzterMergeKey = mergeKey ?? null;
  vorher = jetzt;
  vscode.postMessage({ type: 'dirty' });
  zeichnen();
  if (!mergeKey) {
    panelAufbauen();
  }
  werkzeugeAktualisieren();
}

function standWiederherstellen(stand: string): void {
  modell = diagrammPruefen(JSON.parse(stand));
  vorher = diagrammSerialisieren(modell);
  letzterMergeKey = null;
  verbinden = 'aus';
  auswahlBereinigen();
  vscode.postMessage({ type: 'dirty' });
  zeichnen();
  panelAufbauen();
  werkzeugeAktualisieren();
}
function rueckgaengig(): void {
  const stand = undoStapel.pop();
  if (stand === undefined) {
    return;
  }
  redoStapel.push(vorher);
  standWiederherstellen(stand);
}
function wiederholen(): void {
  const stand = redoStapel.pop();
  if (stand === undefined) {
    return;
  }
  undoStapel.push(vorher);
  standWiederherstellen(stand);
}
function auswahlBereinigen(): void {
  const ids = new Set([...modell.knoten.map(k => k.id), ...modell.kanten.map(k => k.id)]);
  for (const id of [...auswahl]) {
    if (!ids.has(id)) {
      auswahl.delete(id);
    }
  }
}

// ============================================================
// Zeichnen
// ============================================================
function zeichnen(): void {
  welt.setAttribute('transform', `translate(${ansicht.x} ${ansicht.y}) scale(${ansicht.zoom})`);
  $('rasterFlaeche').style.display = modell.raster ? '' : 'none';
  inhalt.replaceChildren();
  inhalt.append(diagrammZeichnen(modell).gruppe);
  if (modell.knoten.length === 0) {
    const sicht = sichtbarerBereich();
    inhalt.append(el('text', { x: sicht.x + sicht.w / 2, y: sicht.y + sicht.h / 2, 'text-anchor': 'middle', class: 'leerhinweis' },
      'Links eine Form anklicken, um sie einzufügen – oder rechts unten „Beispiel laden“.'));
  }
  overlayZeichnen();
  statusAktualisieren();
}

function overlayZeichnen(): void {
  overlay.replaceChildren();
  for (const k of ausgewaehlteKnoten()) {
    const r = rechteck(k);
    overlay.append(el('rect', { x: r.x - 4, y: r.y - 4, width: r.w + 8, height: r.h + 8, rx: 3, class: 'auswahlrahmen' }));
    if (freieGroesse(k.art)) {
      overlay.append(el('rect', { x: r.x + r.w - 6, y: r.y + r.h - 6, width: 14, height: 14, class: 'griff', 'data-griff': k.id }));
    }
  }
  for (const kante of ausgewaehlteKanten()) {
    inhalt.querySelector(`[data-kante="${kante.id}"]`)?.classList.add('ausgewaehlt');
  }
  if (verbinden !== 'aus' && verbinden !== 'quelle') {
    inhalt.querySelector(`[data-knoten="${verbinden}"]`)?.classList.add('verbindungsquelle');
  }
  leinwand.classList.toggle('verbinden', verbinden !== 'aus');
}

function statusAktualisieren(): void {
  const teile = [`${Math.round(ansicht.zoom * 100)} %`, `${modell.knoten.length} Formen`, `${modell.kanten.length} Verbindungen`];
  if (auswahl.size) {
    teile.unshift(`${auswahl.size} ausgewählt`);
  }
  $('statusRechts').textContent = teile.join(' · ');
  $('bZoom100').textContent = `${Math.round(ansicht.zoom * 100)} %`;
}

function werkzeugeAktualisieren(): void {
  ($('bUndo') as HTMLButtonElement).disabled = undoStapel.length === 0;
  ($('bRedo') as HTMLButtonElement).disabled = redoStapel.length === 0;
  $('bVerbinden').classList.toggle('aktiv', verbinden !== 'aus');
  ($('cAuto') as HTMLInputElement).checked = autoVerbinden;
  ($('sKantenArt') as HTMLSelectElement).value = kantenArt;
}

// ============================================================
// Ansicht (Zoom, Verschieben)
// ============================================================
function zoomen(faktor: number, um?: Punkt): void {
  const r = leinwand.getBoundingClientRect();
  const p = um ?? { x: r.width / 2, y: r.height / 2 };
  const neu = Math.min(4, Math.max(0.15, ansicht.zoom * faktor));
  // Punkt unter dem Zeiger bleibt an Ort und Stelle
  ansicht.x = p.x - ((p.x - ansicht.x) / ansicht.zoom) * neu;
  ansicht.y = p.y - ((p.y - ansicht.y) / ansicht.zoom) * neu;
  ansicht.zoom = neu;
  zeichnen();
}
function zoomSetzen(z: number): void {
  zoomen(z / ansicht.zoom);
}
function allesAnzeigen(): void {
  const grenzen = diagrammGrenzen(modell);
  const r = leinwand.getBoundingClientRect();
  if (!grenzen) {
    ansicht.x = 40; ansicht.y = 40; ansicht.zoom = 1;
    zeichnen();
    return;
  }
  const rand = 40;
  const zoom = Math.min(2, Math.max(0.15, Math.min((r.width - rand * 2) / grenzen.w, (r.height - rand * 2) / grenzen.h)));
  ansicht.zoom = zoom;
  ansicht.x = (r.width - grenzen.w * zoom) / 2 - grenzen.x * zoom;
  ansicht.y = (r.height - grenzen.h * zoom) / 2 - grenzen.y * zoom;
  zeichnen();
}
function inSichtBringen(k: Knoten): void {
  const r = rechteck(k);
  const sicht = sichtbarerBereich();
  if (ueberlappt(r, { x: sicht.x + 20, y: sicht.y + 20, w: sicht.w - 40, h: sicht.h - 40 })) {
    return;
  }
  ansicht.x -= (r.x + r.w / 2 - (sicht.x + sicht.w / 2)) * ansicht.zoom;
  ansicht.y -= (r.y + r.h / 2 - (sicht.y + sicht.h / 2)) * ansicht.zoom;
}

// ============================================================
// Formen und Verbindungen anlegen
// ============================================================
function freiePosition(w: number, h: number, wunsch: Punkt, ausser: Set<string> = new Set()): Punkt {
  const andere = modell.knoten.filter(k => !ausser.has(k.id) && k.art !== 'rahmen').map(rechteck);
  const frei = (p: Punkt) => !andere.some(r => ueberlappt({ x: p.x, y: p.y, w, h }, r, 16));
  const start = { x: schnappen(wunsch.x), y: schnappen(wunsch.y) };
  if (frei(start)) {
    return start;
  }
  // nach rechts, dann nach unten weiterrücken
  for (let abstand = 40; abstand < 2000; abstand += 40) {
    for (const p of [{ x: start.x + abstand, y: start.y }, { x: start.x, y: start.y + abstand }, { x: start.x - abstand, y: start.y }]) {
      if (frei(p)) {
        return { x: schnappen(p.x), y: schnappen(p.y) };
      }
    }
  }
  return start;
}

function formHinzufuegen(def: KnotenDefinition): void {
  const neu: Knoten = { id: neueId('n'), art: def.art, x: 0, y: 0, name: def.standardName };
  if (def.w) {
    neu.w = def.w;
  }
  if (def.h) {
    neu.h = def.h;
  }
  if (def.art === 'notiz') {
    neu.zeilen = [];
  }
  const m = masse(neu);
  const ausgewaehlt = ausgewaehlteKnoten();
  const bezug = ausgewaehlt.length === 1 && ausgewaehlt[0].art !== 'rahmen' ? ausgewaehlt[0] : null;
  const sicht = sichtbarerBereich();
  let verbindung: Kante | null = null;

  if (def.art === 'rahmen' && ausgewaehlt.length > 0) {
    // Rahmen um die Auswahl legen
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const k of ausgewaehlt) {
      const r = rechteck(k);
      x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
    }
    neu.x = schnappen(x1 - 20); neu.y = schnappen(y1 - 40); neu.w = schnappen(x2 - x1 + 40); neu.h = schnappen(y2 - y1 + 60);
  } else if (modell.typ === 'sequenz' && (def.art === 'lebenslinie' || def.art === 'akteur')) {
    const linien = modell.knoten.filter(k => k.art === 'lebenslinie' || k.art === 'akteur');
    neu.y = linien.length ? Math.min(...linien.map(k => k.y)) : SEQ_KOPF_Y;
    neu.x = linien.length ? Math.max(...linien.map(k => k.x + masse(k).w)) + 60 : 60;
    neu.x = schnappen(neu.x);
  } else if (bezug) {
    const r = rechteck(bezug);
    const wunsch = modell.richtung === 'links'
      ? { x: r.x + r.w + 70, y: r.y + r.h / 2 - m.h / 2 }
      : { x: r.x + r.w / 2 - m.w / 2, y: r.y + r.h + 60 };
    const p = freiePosition(m.w, m.h, wunsch);
    neu.x = p.x; neu.y = p.y;
    const bezugKannVerbinden = !['notiz', 'text', 'rahmen'].includes(bezug.art);
    if (autoVerbinden && bezugKannVerbinden && def.art !== 'rahmen') {
      const art: KantenArt = def.art === 'notiz' ? 'notizLinie' : kantenArt;
      verbindung = { id: neueId('e'), art, von: bezug.id, nach: neu.id };
    }
  } else {
    const p = freiePosition(m.w, m.h, { x: sicht.x + sicht.w / 2 - m.w / 2, y: sicht.y + sicht.h / 2 - m.h / 2 });
    neu.x = p.x; neu.y = p.y;
  }

  aendern(() => {
    modell.knoten.push(neu);
    if (verbindung) {
      modell.kanten.push(verbindung);
    }
  });
  auswahl.clear();
  auswahl.add(neu.id);
  inSichtBringen(neu);
  zeichnen();
  panelAufbauen();
  if (!def.ohneName) {
    namensfeldFokussieren();
  }
  hinweisSetzen(def.ohneName ? `${def.name} eingefügt.` : `${def.name} eingefügt – Name eintippen. Mit Shift+Klick auf eine andere Form verbindest du sie.`);
}

function verbindungAnlegen(vonId: string, nachId: string, art: KantenArt = kantenArt): void {
  const von = knotenMitId(vonId);
  const nach = knotenMitId(nachId);
  if (!von || !nach) {
    return;
  }
  const kante: Kante = { id: neueId('e'), art, von: vonId, nach: nachId };
  if ((von.art === 'notiz' || nach.art === 'notiz') && !istNachricht(art)) {
    kante.art = 'notizLinie';
  }
  if (modell.typ === 'sequenz' && !istNachricht(kante.art) && (von.art === 'lebenslinie' || von.art === 'akteur') && (nach.art === 'lebenslinie' || nach.art === 'akteur')) {
    kante.art = 'nachricht';
  }
  aendern(() => {
    // Neue Nachricht hinter der ausgewählten Nachricht einfügen, sonst ans Ende
    const ausgewaehlteNachricht = ausgewaehlteKanten().find(k => istNachricht(k.art));
    if (istNachricht(kante.art) && ausgewaehlteNachricht) {
      modell.kanten.splice(modell.kanten.indexOf(ausgewaehlteNachricht) + 1, 0, kante);
    } else {
      modell.kanten.push(kante);
    }
  });
  auswahl.clear();
  auswahl.add(kante.id);
  zeichnen();
  panelAufbauen();
  const feld = document.getElementById('fKantenText') as HTMLInputElement | null;
  feld?.focus();
  hinweisSetzen(`${KANTEN_NAMEN[kante.art]} angelegt – Beschriftung rechts eintippen.`);
}

function verbindenStarten(vonId?: string): void {
  const einzeln = ausgewaehlteKnoten();
  verbinden = vonId ?? (einzeln.length === 1 ? einzeln[0].id : 'quelle');
  hinweisSetzen(verbinden === 'quelle' ? 'Verbinden: Zuerst die Startform anklicken …' : 'Verbinden: Jetzt die Zielform anklicken (Esc bricht ab).', true);
  werkzeugeAktualisieren();
  overlayZeichnen();
}
function verbindenBeenden(): void {
  verbinden = 'aus';
  werkzeugeAktualisieren();
  overlayZeichnen();
  hinweisSetzen('');
}

function auswahlLoeschen(): void {
  if (auswahl.size === 0) {
    return;
  }
  const knotenIds = new Set(ausgewaehlteKnoten().map(k => k.id));
  if (knotenIds.has(verbinden)) {
    verbinden = 'aus';
  }
  aendern(() => {
    modell.knoten = modell.knoten.filter(k => !knotenIds.has(k.id));
    modell.kanten = modell.kanten.filter(k => !auswahl.has(k.id) && !knotenIds.has(k.von) && !knotenIds.has(k.nach));
  });
  auswahl.clear();
  zeichnen();
  panelAufbauen();
}

function kopieren(): void {
  const knoten = ausgewaehlteKnoten();
  if (knoten.length === 0) {
    return;
  }
  const ids = new Set(knoten.map(k => k.id));
  zwischenablage = {
    knoten: JSON.parse(JSON.stringify(knoten)),
    kanten: JSON.parse(JSON.stringify(modell.kanten.filter(k => ids.has(k.von) && ids.has(k.nach)))),
  };
  vscode.postMessage({ type: 'zwischenablage', daten: zwischenablage });
  hinweisSetzen(`${knoten.length} Form(en) kopiert.`);
}
function einfuegen(versatz = 30): void {
  if (!zwischenablage) {
    return;
  }
  const neueIds = new Map<string, string>();
  const knoten = zwischenablage.knoten.map(k => {
    const id = neueId('n');
    neueIds.set(k.id, id);
    return { ...k, id, x: schnappen(k.x + versatz), y: schnappen(k.y + versatz) };
  });
  const kanten = zwischenablage.kanten.map(k => ({ ...k, id: neueId('e'), von: neueIds.get(k.von)!, nach: neueIds.get(k.nach)! }));
  aendern(() => {
    modell.knoten.push(...knoten);
    modell.kanten.push(...kanten);
  });
  auswahl.clear();
  knoten.forEach(k => auswahl.add(k.id));
  // beim nächsten Einfügen weiter versetzen
  zwischenablage = { knoten: knoten.map(k => ({ ...k })), kanten: kanten.map(k => ({ ...k })) };
  zeichnen();
  panelAufbauen();
}
function duplizieren(): void {
  const vorherige = zwischenablage;
  kopieren();
  einfuegen();
  zwischenablage = vorherige ?? zwischenablage;
}

function verschieben(dx: number, dy: number): void {
  const knoten = ausgewaehlteKnoten();
  if (knoten.length === 0) {
    return;
  }
  aendern(() => {
    for (const k of knoten) {
      k.x += dx;
      if (!(modell.typ === 'sequenz' && (k.art === 'lebenslinie' || k.art === 'akteur'))) {
        k.y += dy;
      }
    }
  }, 'pfeiltasten');
}

function ausrichten(wie: 'links' | 'oben' | 'mitteX' | 'mitteY' | 'verteilenX' | 'verteilenY'): void {
  const knoten = ausgewaehlteKnoten();
  if (knoten.length < 2) {
    return;
  }
  aendern(() => {
    const rs = knoten.map(k => ({ k, r: rechteck(k) }));
    switch (wie) {
      case 'links': {
        const x = Math.min(...rs.map(e => e.r.x));
        rs.forEach(e => { e.k.x = x; });
        break;
      }
      case 'oben': {
        const y = Math.min(...rs.map(e => e.r.y));
        rs.forEach(e => { e.k.y = y; });
        break;
      }
      case 'mitteX': {
        const cx = rs.reduce((s, e) => s + e.r.x + e.r.w / 2, 0) / rs.length;
        rs.forEach(e => { e.k.x = schnappen(cx - e.r.w / 2); });
        break;
      }
      case 'mitteY': {
        const cy = rs.reduce((s, e) => s + e.r.y + e.r.h / 2, 0) / rs.length;
        rs.forEach(e => { e.k.y = schnappen(cy - e.r.h / 2); });
        break;
      }
      case 'verteilenX': {
        rs.sort((a, b) => a.r.x - b.r.x);
        const gesamt = rs[rs.length - 1].r.x + rs[rs.length - 1].r.w - rs[0].r.x;
        const luecke = (gesamt - rs.reduce((s, e) => s + e.r.w, 0)) / (rs.length - 1);
        let x = rs[0].r.x;
        rs.forEach(e => { e.k.x = schnappen(x); x += e.r.w + luecke; });
        break;
      }
      case 'verteilenY': {
        rs.sort((a, b) => a.r.y - b.r.y);
        const gesamt = rs[rs.length - 1].r.y + rs[rs.length - 1].r.h - rs[0].r.y;
        const luecke = (gesamt - rs.reduce((s, e) => s + e.r.h, 0)) / (rs.length - 1);
        let y = rs[0].r.y;
        rs.forEach(e => { e.k.y = schnappen(y); y += e.r.h + luecke; });
        break;
      }
    }
  });
}

function anordnen(): void {
  aendern(() => automatischAnordnen(modell));
  allesAnzeigen();
  hinweisSetzen('Formen automatisch angeordnet (Strg+Z macht es rückgängig).');
}

function typWechseln(typ: DiagrammTyp): void {
  const gruppe = gruppeFuer(typ);
  aendern(() => {
    modell.typ = typ;
    modell.richtung = gruppe.richtung;
  });
  kantenArt = gruppe.standardKante;
  autoVerbinden = gruppe.autoVerbinden;
  paletteAufbauen();
  werkzeugeAktualisieren();
  zeichnen();
}

async function exportieren(format: 'svg' | 'png'): Promise<void> {
  try {
    if (format === 'svg') {
      vscode.postMessage({ type: 'export', format, inhalt: exportSvg(modell).svg });
    } else {
      vscode.postMessage({ type: 'export', format, inhalt: await exportPng(modell) });
    }
  } catch (e) {
    fehler('Export fehlgeschlagen', e);
  }
}

// ============================================================
// Palette (links)
// ============================================================
function formSymbol(art: KnotenArt): SVGSVGElement {
  const k: Knoten = { id: 'sym', art, x: 0, y: 0, name: art === 'verbinder' ? 'A' : art === 'text' ? 'Text' : 'Ab', w: art === 'balken' ? 60 : art === 'rahmen' ? 80 : art === 'notiz' ? 60 : undefined, h: art === 'rahmen' ? 50 : undefined };
  if (art === 'klasse' || art === 'schnittstelle' || art === 'aufzaehlung') {
    k.zeilen = ['a'];
    k.methoden = ['b'];
  }
  const m = masse(k);
  const svg = el('svg', { viewBox: `-3 -3 ${m.w + 6} ${m.h + 6}`, preserveAspectRatio: 'xMidYMid meet' });
  svg.append(knotenZeichnen(k, { ...leeresDiagramm('frei'), knoten: [k] }));
  return svg;
}

function kantenSymbol(art: KantenArt): SVGSVGElement {
  const a: Knoten = { id: 'a', art: 'text', x: 0, y: 0, name: '' };
  const b: Knoten = { id: 'b', art: 'text', x: 90, y: 0, name: '' };
  const d: Diagramm = { ...leeresDiagramm('frei'), knoten: [a, b], kanten: [{ id: 'e', art, von: 'a', nach: 'b' }] };
  const svg = el('svg', { viewBox: '0 -12 120 40', preserveAspectRatio: 'xMidYMid meet' });
  const g = diagrammZeichnen(d).gruppe;
  g.querySelectorAll('.kantentext').forEach(t => t.remove());
  svg.append(g);
  return svg;
}

function paletteAufbauen(): void {
  palette.replaceChildren();
  for (const gruppe of PALETTE) {
    const details = document.createElement('details');
    details.open = gruppe.typ === modell.typ;
    const summary = document.createElement('summary');
    summary.textContent = gruppe.name;
    details.append(summary);
    const liste = document.createElement('div');
    liste.className = 'formen';
    gruppe.formen.forEach((def, i) => {
      const b = document.createElement('button');
      b.className = 'form';
      b.title = `${def.name} einfügen`;
      b.append(formSymbol(def.art), document.createTextNode(def.name));
      if (gruppe.typ === modell.typ && i < 9) {
        const taste = document.createElement('span');
        taste.className = 'taste';
        taste.textContent = String(i + 1);
        b.append(taste);
      }
      b.addEventListener('click', () => formHinzufuegen(def));
      liste.append(b);
    });
    details.append(liste);
    const ueberschrift = document.createElement('h3');
    ueberschrift.textContent = 'Verbindungen';
    details.append(ueberschrift);
    const kanten = document.createElement('div');
    kanten.className = 'kantenliste';
    for (const art of gruppe.kanten) {
      const b = document.createElement('button');
      b.title = `${KANTEN_NAMEN[art]}: als Verbindungsart wählen und Verbinden starten`;
      b.append(kantenSymbol(art), document.createTextNode(KANTEN_NAMEN[art]));
      b.addEventListener('click', () => {
        kantenArt = art;
        const kanteAusgewaehlt = ausgewaehlteKanten();
        if (kanteAusgewaehlt.length > 0 && ausgewaehlteKnoten().length === 0) {
          // ausgewählte Verbindungen umwandeln
          aendern(() => kanteAusgewaehlt.forEach(k => { k.art = art; }));
          return;
        }
        verbindenStarten();
      });
      kanten.append(b);
    }
    details.append(kanten);
    palette.append(details);
  }
}

// ============================================================
// Eigenschaften (rechts)
// ============================================================
function feld(beschriftung: string, eingabe: HTMLElement): HTMLElement {
  // label nur um echte Eingabefelder (ein label um Knöpfe würde Klicks auf den ersten Knopf umleiten)
  const wrapper = document.createElement(['INPUT', 'SELECT', 'TEXTAREA'].includes(eingabe.tagName) ? 'label' : 'div');
  wrapper.className = 'feld';
  const span = document.createElement('span');
  span.textContent = beschriftung;
  wrapper.append(span, eingabe);
  return wrapper;
}
function textfeld(id: string, wert: string, aufAenderung: (v: string) => void, platzhalter = ''): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'text';
  i.id = id;
  i.value = wert;
  i.placeholder = platzhalter;
  i.addEventListener('input', () => aufAenderung(i.value));
  return i;
}
function mehrzeilig(id: string, zeilen: string[], aufAenderung: (v: string[]) => void, platzhalter = ''): HTMLTextAreaElement {
  const t = document.createElement('textarea');
  t.id = id;
  t.value = zeilen.join('\n');
  t.placeholder = platzhalter;
  t.rows = Math.max(3, Math.min(10, zeilen.length + 1));
  t.addEventListener('input', () => aufAenderung(t.value.split('\n').filter((z, i, arr) => z !== '' || i < arr.length - 1)));
  return t;
}
function auswahlliste(id: string, optionen: { wert: string; name: string }[], wert: string, aufAenderung: (v: string) => void): HTMLSelectElement {
  const s = document.createElement('select');
  s.id = id;
  for (const o of optionen) {
    const opt = document.createElement('option');
    opt.value = o.wert;
    opt.textContent = o.name;
    s.append(opt);
  }
  s.value = wert;
  s.addEventListener('change', () => aufAenderung(s.value));
  return s;
}
function kontrollkaestchen(id: string, beschriftung: string, wert: boolean, aufAenderung: (v: boolean) => void): HTMLElement {
  const l = document.createElement('label');
  l.className = 'umschalter';
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.id = id;
  c.checked = wert;
  c.addEventListener('change', () => aufAenderung(c.checked));
  l.append(c, document.createTextNode(beschriftung));
  return l;
}
function knopf(beschriftung: string, aufKlick: () => void, klasse = '', titel = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = beschriftung;
  b.className = klasse;
  b.title = titel;
  b.addEventListener('click', aufKlick);
  return b;
}
function knopfzeile(...knoepfe: HTMLElement[]): HTMLElement {
  const d = document.createElement('div');
  d.className = 'knoepfe';
  d.append(...knoepfe);
  return d;
}
function tipp(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'tipp';
  p.textContent = text;
  return p;
}
function ueberschrift(text: string): HTMLElement {
  const h = document.createElement('h2');
  h.textContent = text;
  return h;
}

function namensfeldFokussieren(): void {
  const f = document.getElementById('fName') as HTMLInputElement | HTMLTextAreaElement | null;
  if (f) {
    f.focus();
    f.select();
  }
}

function panelAufbauen(): void {
  const fokusId = (document.activeElement as HTMLElement | null)?.id;
  eigenschaften.replaceChildren();
  const knoten = ausgewaehlteKnoten();
  const kanten = ausgewaehlteKanten();
  if (knoten.length === 1 && kanten.length === 0) {
    knotenPanel(knoten[0]);
  } else if (kanten.length === 1 && knoten.length === 0) {
    kantenPanel(kanten[0]);
  } else if (auswahl.size > 1) {
    mehrfachPanel(knoten, kanten);
  } else {
    diagrammPanel();
  }
  if (fokusId) {
    const wieder = document.getElementById(fokusId);
    if (wieder && eigenschaften.contains(wieder)) {
      wieder.focus();
    }
  }
}

function diagrammPanel(): void {
  eigenschaften.append(ueberschrift('Diagramm'));
  eigenschaften.append(feld('Titel', textfeld('fTitel', modell.titel, v => aendern(() => { modell.titel = v; }, 'titel'))));
  eigenschaften.append(feld('Diagrammtyp', auswahlliste('fTyp', DIAGRAMM_TYPEN.map(t => ({ wert: t.typ, name: t.name })), modell.typ, v => typWechseln(v as DiagrammTyp))));
  eigenschaften.append(feld('Linien', auswahlliste('fLinie', [{ wert: 'gerade', name: 'Gerade' }, { wert: 'rechtwinklig', name: 'Rechtwinklig' }], modell.linie, v => aendern(() => { modell.linie = v as Diagramm['linie']; }))));
  eigenschaften.append(feld('Anordnen-Richtung', auswahlliste('fRichtung', [{ wert: 'oben', name: 'Von oben nach unten' }, { wert: 'links', name: 'Von links nach rechts' }], modell.richtung, v => aendern(() => { modell.richtung = v as Diagramm['richtung']; }))));
  eigenschaften.append(kontrollkaestchen('fRaster', 'Am Raster ausrichten', modell.raster, v => aendern(() => { modell.raster = v; })));
  eigenschaften.append(knopfzeile(
    knopf('⇅ Automatisch anordnen', anordnen, '', 'Alle Formen automatisch anordnen (L)'),
  ));
  eigenschaften.append(knopfzeile(
    knopf('Beispiel laden', () => {
      aendern(() => { modell = beispiel(modell.typ); });
      auswahl.clear();
      kantenArt = gruppeFuer(modell.typ).standardKante;
      allesAnzeigen();
      panelAufbauen();
      hinweisSetzen('Beispiel geladen – Strg+Z holt den vorherigen Stand zurück.');
    }, '', 'Ein kleines Beispiel für diesen Diagrammtyp einfügen (ersetzt den Inhalt)'),
    knopf('Alles auswählen', () => { modell.knoten.forEach(k => auswahl.add(k.id)); zeichnen(); panelAufbauen(); }),
  ));
  const abschnitt = document.createElement('div');
  abschnitt.className = 'abschnitt abstand';
  abschnitt.append(tipp('So geht’s: Form links anklicken (oder Zifferntaste drücken) → Name tippen → nächste Form. ' +
    'Verbinden: Form auswählen, dann Shift+Klick auf die Zielform. „Anordnen“ sortiert alles automatisch.'));
  abschnitt.append(tipp('Zwei-Finger-Wischen verschiebt die Ansicht, Strg+Scrollen (oder Zusammenziehen) zoomt. Taste ? zeigt alle Kürzel.'));
  eigenschaften.append(abschnitt);
}

function knotenPanel(k: Knoten): void {
  const def = knotenDefinition(k.art);
  eigenschaften.append(ueberschrift(def.name));
  const merge = (feldName: string) => `${k.id}:${feldName}`;
  const istKlasse = k.art === 'klasse' || k.art === 'schnittstelle' || k.art === 'aufzaehlung';

  if (!def.ohneName) {
    if (istKlasse || k.art === 'lebenslinie' || k.art === 'verbinder' || k.art === 'akteur' || k.art === 'rahmen') {
      eigenschaften.append(feld('Name', textfeld('fName', k.name, v => aendern(() => { k.name = v; }, merge('name')))));
    } else {
      const t = mehrzeilig('fName', k.name.split('\n'), v => aendern(() => { k.name = v.join('\n'); }, merge('name')), 'Text (mehrzeilig möglich)');
      t.rows = Math.max(2, Math.min(6, k.name.split('\n').length + 1));
      eigenschaften.append(feld('Text', t));
    }
  }
  if (istKlasse) {
    eigenschaften.append(feld('Stereotyp (z. B. interface)', textfeld('fStereotyp', k.stereotyp ?? '', v => aendern(() => { k.stereotyp = v || undefined; }, merge('stereotyp')), k.art === 'schnittstelle' ? 'interface' : '')));
    eigenschaften.append(kontrollkaestchen('fAbstrakt', 'Abstrakt (kursiv)', !!k.abstrakt, v => aendern(() => { k.abstrakt = v || undefined; })));
    eigenschaften.append(feld(k.art === 'aufzaehlung' ? 'Werte (eine je Zeile)' : 'Attribute (eines je Zeile)', mehrzeilig('fZeilen', k.zeilen ?? [], v => aendern(() => { k.zeilen = v; }, merge('zeilen')), '- name: String\n+ alter: int')));
    if (k.art !== 'aufzaehlung') {
      eigenschaften.append(feld('Methoden (eine je Zeile)', mehrzeilig('fMethoden', k.methoden ?? [], v => aendern(() => { k.methoden = v; }, merge('methoden')), '+ getName(): String')));
    }
    eigenschaften.append(tipp('Sichtbarkeit: + öffentlich, - privat, # geschützt, ~ Paket. Statische Elemente werden unterstrichen dargestellt, wenn du sie so schreibst.'));
  }
  if (k.art === 'zustand') {
    eigenschaften.append(feld('Aktionen (eine je Zeile)', mehrzeilig('fZeilen', k.zeilen ?? [], v => aendern(() => { k.zeilen = v; }, merge('zeilen')), 'entry / …\ndo / …\nexit / …')));
  }
  if (k.art === 'notiz') {
    eigenschaften.append(feld('Weitere Zeilen', mehrzeilig('fZeilen', k.zeilen ?? [], v => aendern(() => { k.zeilen = v; }, merge('zeilen')))));
  }
  if (k.art === 'rahmen') {
    eigenschaften.append(feld('Bedingung / Text', mehrzeilig('fZeilen', k.zeilen ?? [], v => aendern(() => { k.zeilen = v; }, merge('zeilen')), '[x > 0]')));
  }
  if (freieGroesse(k.art) || istKlasse || k.art === 'aktion' || k.art === 'zustand' || k.art === 'anwendungsfall' || k.art === 'lebenslinie' || k.art === 'entscheidung' || k.art === 'eingabe') {
    const m = masse(k);
    const breite = document.createElement('input');
    breite.type = 'number';
    breite.id = 'fBreite';
    breite.value = String(Math.round(m.w));
    breite.min = '10';
    breite.step = '10';
    breite.addEventListener('change', () => aendern(() => { k.w = Math.max(10, Number(breite.value) || m.w); }));
    const zeile = document.createElement('div');
    zeile.className = 'zeile';
    zeile.append(feld('Breite', breite));
    if (k.art === 'rahmen' || k.art === 'balken') {
      const hoehe = document.createElement('input');
      hoehe.type = 'number';
      hoehe.id = 'fHoehe';
      hoehe.value = String(Math.round(m.h));
      hoehe.min = '4';
      hoehe.step = '10';
      hoehe.addEventListener('change', () => aendern(() => { k.h = Math.max(4, Number(hoehe.value) || m.h); }));
      zeile.append(feld('Höhe', hoehe));
    }
    eigenschaften.append(zeile);
  }
  if (k.art === 'balken') {
    eigenschaften.append(knopfzeile(knopf('Drehen', () => aendern(() => { const m = masse(k); k.w = m.h; k.h = m.w; }))));
  }
  if (!['start', 'ende', 'endeAblauf', 'startzustand', 'endzustand', 'balken', 'text', 'akteur'].includes(k.art)) {
    const farben = document.createElement('div');
    farben.className = 'farben';
    for (const f of FARBEN) {
      const b = document.createElement('button');
      b.title = f.name;
      b.style.background = f.wert || 'var(--uml-fill)';
      b.classList.toggle('aktiv', (k.farbe ?? '') === f.wert);
      b.addEventListener('click', () => aendern(() => { k.farbe = f.wert || undefined; }));
      farben.append(b);
    }
    eigenschaften.append(feld('Füllfarbe', farben));
  }

  eigenschaften.append(knopfzeile(
    knopf('🔗 Verbinden', () => verbindenStarten(k.id), 'primaer', 'Diese Form mit einer anderen verbinden: danach die Zielform anklicken'),
    knopf('Duplizieren', duplizieren, '', 'Strg+D'),
  ));
  const verbindungen = modell.kanten.filter(e => e.von === k.id || e.nach === k.id);
  if (verbindungen.length) {
    const liste = document.createElement('div');
    liste.className = 'feld';
    const s = document.createElement('span');
    s.textContent = 'Verbindungen';
    liste.append(s);
    for (const e of verbindungen) {
      const anderer = knotenMitId(e.von === k.id ? e.nach : e.von);
      const b = knopf(`${e.von === k.id ? '→' : '←'} ${anderer?.name?.split('\n')[0] || knotenDefinition(anderer?.art ?? 'aktion').name}${e.text ? ` (${e.text})` : ''}`, () => {
        auswahl.clear();
        auswahl.add(e.id);
        zeichnen();
        panelAufbauen();
      }, '', KANTEN_NAMEN[e.art]);
      b.style.justifyContent = 'flex-start';
      liste.append(b);
    }
    eigenschaften.append(liste);
  }
  eigenschaften.append(knopfzeile(knopf('Löschen', auswahlLoeschen, 'gefahr', 'Entf')));
  eigenschaften.append(tipp('Verschieben: ziehen oder Pfeiltasten (Shift = größere Schritte). Shift+Klick auf eine andere Form verbindet beide.'));
}

function kantenPanel(e: Kante): void {
  eigenschaften.append(ueberschrift('Verbindung'));
  const von = knotenMitId(e.von);
  const nach = knotenMitId(e.nach);
  const merge = (feldName: string) => `${e.id}:${feldName}`;
  const gruppe = gruppeFuer(modell.typ);
  const arten = [...gruppe.kanten, ...ALLE_KANTEN.filter(a => !gruppe.kanten.includes(a))];
  eigenschaften.append(feld('Art', auswahlliste('fKantenArt', arten.map(a => ({ wert: a, name: KANTEN_NAMEN[a] })), e.art, v => aendern(() => { e.art = v as KantenArt; }))));
  const istNachr = modell.typ === 'sequenz' && istNachricht(e.art);
  eigenschaften.append(feld(istNachr ? 'Nachricht' : 'Beschriftung', textfeld('fKantenText', e.text ?? '', v => aendern(() => { e.text = v || undefined; }, merge('text')), istNachr ? 'methode(param)' : modell.typ === 'aktivitaet' ? '[Bedingung]' : '')));
  if (!istNachr) {
    const zeile = document.createElement('div');
    zeile.className = 'zeile';
    zeile.append(
      feld(`Am Anfang (${von?.name.split('\n')[0] || 'Start'})`, textfeld('fVonText', e.vonText ?? '', v => aendern(() => { e.vonText = v || undefined; }, merge('vonText')), modell.typ === 'klasse' ? '1' : '')),
      feld(`Am Ende (${nach?.name.split('\n')[0] || 'Ziel'})`, textfeld('fNachText', e.nachText ?? '', v => aendern(() => { e.nachText = v || undefined; }, merge('nachText')), modell.typ === 'klasse' ? '*' : '')),
    );
    eigenschaften.append(zeile);
    eigenschaften.append(feld('Linienführung', auswahlliste('fKantenLinie', [{ wert: '', name: `Wie Diagramm (${modell.linie})` }, { wert: 'gerade', name: 'Gerade' }, { wert: 'rechtwinklig', name: 'Rechtwinklig' }], e.linie ?? '', v => aendern(() => { e.linie = (v || undefined) as Kante['linie']; }))));
  }
  const knoepfe: HTMLElement[] = [knopf('⇄ Richtung umkehren', () => aendern(() => { [e.von, e.nach] = [e.nach, e.von]; }))];
  if (istNachr) {
    const nachrichten = modell.kanten.filter(k => istNachricht(k.art));
    const i = nachrichten.indexOf(e);
    const tauschen = (mit: Kante) => aendern(() => {
      const a = modell.kanten.indexOf(e);
      const b = modell.kanten.indexOf(mit);
      [modell.kanten[a], modell.kanten[b]] = [modell.kanten[b], modell.kanten[a]];
    });
    const hoch = knopf('↑ Früher', () => tauschen(nachrichten[i - 1]));
    hoch.disabled = i <= 0;
    const runter = knopf('↓ Später', () => tauschen(nachrichten[i + 1]));
    runter.disabled = i >= nachrichten.length - 1;
    knoepfe.push(hoch, runter);
  }
  eigenschaften.append(knopfzeile(...knoepfe));
  eigenschaften.append(knopfzeile(knopf('Löschen', auswahlLoeschen, 'gefahr', 'Entf')));
  if (modell.typ === 'klasse') {
    eigenschaften.append(tipp('Multiplizitäten wie 1, 0..1, * oder 1..* kommen in die Felder „Am Anfang“ / „Am Ende“. Rollennamen ebenfalls, z. B. „leitet“.'));
  }
  if (istNachr) {
    eigenschaften.append(tipp('Nachrichten kannst du auch direkt im Diagramm nach oben oder unten ziehen, um die Reihenfolge zu ändern.'));
  }
}

function mehrfachPanel(knoten: Knoten[], kanten: Kante[]): void {
  eigenschaften.append(ueberschrift(`${auswahl.size} Elemente ausgewählt`));
  if (knoten.length >= 2) {
    eigenschaften.append(feld('Ausrichten', knopfzeile(
      knopf('Links', () => ausrichten('links')), knopf('Oben', () => ausrichten('oben')),
      knopf('Mittig ↔', () => ausrichten('mitteX')), knopf('Mittig ↕', () => ausrichten('mitteY')),
    )));
    if (knoten.length >= 3) {
      eigenschaften.append(feld('Gleichmäßig verteilen', knopfzeile(knopf('Waagerecht', () => ausrichten('verteilenX')), knopf('Senkrecht', () => ausrichten('verteilenY')))));
    }
    eigenschaften.append(knopfzeile(knopf('Rahmen darum legen', () => formHinzufuegen(knotenDefinition('rahmen')))));
    const farben = document.createElement('div');
    farben.className = 'farben';
    for (const f of FARBEN) {
      const b = document.createElement('button');
      b.title = f.name;
      b.style.background = f.wert || 'var(--uml-fill)';
      b.addEventListener('click', () => aendern(() => knoten.forEach(k => { k.farbe = f.wert || undefined; })));
      farben.append(b);
    }
    eigenschaften.append(feld('Füllfarbe', farben));
  }
  if (kanten.length >= 1) {
    const gruppe = gruppeFuer(modell.typ);
    eigenschaften.append(feld('Art aller Verbindungen', auswahlliste('fKantenArt', [{ wert: '', name: '(unverändert)' }, ...gruppe.kanten.map(a => ({ wert: a, name: KANTEN_NAMEN[a] }))], '', v => {
      if (v) {
        aendern(() => kanten.forEach(k => { k.art = v as KantenArt; }));
      }
    })));
  }
  eigenschaften.append(knopfzeile(knopf('Duplizieren', duplizieren), knopf('Löschen', auswahlLoeschen, 'gefahr')));
}

// ============================================================
// Zeigerbedienung auf der Leinwand
// ============================================================
type Ziehen =
  | { art: 'knoten'; start: Punkt; positionen: Map<string, Punkt>; bewegt: boolean }
  | { art: 'schieben'; start: Punkt; ansicht: Punkt; bewegt: boolean }
  | { art: 'gummiband'; start: Punkt; rect: SVGRectElement }
  | { art: 'groesse'; id: string; start: Punkt; w: number; h: number }
  | { art: 'nachricht'; kante: Kante; startIndex: number }
  | { art: 'klick' };
let ziehen: Ziehen | null = null;

function elementUnter(ziel: EventTarget | null): { knoten?: string; kante?: string; griff?: string } {
  let e = ziel as Element | null;
  while (e && e !== leinwand) {
    if (e instanceof Element) {
      const griff = e.getAttribute('data-griff');
      if (griff) {
        return { griff };
      }
      const knoten = e.getAttribute('data-knoten');
      if (knoten) {
        return { knoten };
      }
      const kante = e.getAttribute('data-kante');
      if (kante) {
        return { kante };
      }
    }
    e = e.parentElement;
  }
  return {};
}

leinwand.addEventListener('pointerdown', ev => {
  if (ev.button !== 0) {
    return;
  }
  (document.activeElement as HTMLElement | null)?.blur();
  const p = weltPunkt(ev);
  const treffer = elementUnter(ev.target);
  leinwand.setPointerCapture(ev.pointerId);

  if (treffer.griff) {
    const k = knotenMitId(treffer.griff)!;
    const m = masse(k);
    ziehen = { art: 'groesse', id: k.id, start: p, w: m.w, h: m.h };
    return;
  }

  if (treffer.knoten) {
    const id = treffer.knoten;
    if (verbinden === 'quelle') {
      verbinden = id;
      hinweisSetzen('Jetzt die Zielform anklicken (Esc bricht ab).', true);
      overlayZeichnen();
      ziehen = { art: 'klick' };
      return;
    }
    if (verbinden !== 'aus') {
      const von = verbinden;
      verbindenBeenden();
      verbindungAnlegen(von, id);
      ziehen = { art: 'klick' };
      return;
    }
    const einzeln = ausgewaehlteKnoten();
    if (ev.shiftKey && einzeln.length === 1 && !auswahl.has(id)) {
      verbindungAnlegen(einzeln[0].id, id);
      ziehen = { art: 'klick' };
      return;
    }
    if (ev.ctrlKey || ev.metaKey || (ev.shiftKey && auswahl.has(id))) {
      if (auswahl.has(id)) {
        auswahl.delete(id);
      } else {
        auswahl.add(id);
      }
      zeichnen();
      panelAufbauen();
      ziehen = { art: 'klick' };
      return;
    }
    if (!auswahl.has(id)) {
      auswahl.clear();
      auswahl.add(id);
      zeichnen();
      panelAufbauen();
    }
    // Rahmen ziehen nimmt seinen Inhalt mit
    const mitziehen = new Set(auswahl);
    for (const k of ausgewaehlteKnoten()) {
      if (k.art === 'rahmen') {
        const r = rechteck(k);
        for (const anderer of modell.knoten) {
          const ar = rechteck(anderer);
          if (anderer.art !== 'rahmen' && ar.x >= r.x && ar.y >= r.y && ar.x + ar.w <= r.x + r.w && ar.y + ar.h <= r.y + r.h) {
            mitziehen.add(anderer.id);
          }
        }
      }
    }
    const positionen = new Map<string, Punkt>();
    for (const kid of mitziehen) {
      const k = knotenMitId(kid);
      if (k) {
        positionen.set(kid, { x: k.x, y: k.y });
      }
    }
    ziehen = { art: 'knoten', start: p, positionen, bewegt: false };
    return;
  }

  if (treffer.kante) {
    const kante = kanteMitId(treffer.kante)!;
    if (verbinden !== 'aus') {
      verbindenBeenden();
    }
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
      if (auswahl.has(kante.id)) {
        auswahl.delete(kante.id);
      } else {
        auswahl.add(kante.id);
      }
    } else {
      auswahl.clear();
      auswahl.add(kante.id);
    }
    zeichnen();
    panelAufbauen();
    if (modell.typ === 'sequenz' && istNachricht(kante.art)) {
      ziehen = { art: 'nachricht', kante, startIndex: modell.kanten.filter(k => istNachricht(k.art)).indexOf(kante) };
    } else {
      ziehen = { art: 'klick' };
    }
    return;
  }

  // Hintergrund
  if (verbinden !== 'aus') {
    verbindenBeenden();
  }
  if (ev.shiftKey) {
    const rect = el('rect', { x: p.x, y: p.y, width: 0, height: 0, class: 'gummiband' });
    overlay.append(rect);
    ziehen = { art: 'gummiband', start: p, rect };
  } else {
    ziehen = { art: 'schieben', start: { x: ev.clientX, y: ev.clientY }, ansicht: { x: ansicht.x, y: ansicht.y }, bewegt: false };
  }
});

leinwand.addEventListener('pointermove', ev => {
  if (!ziehen) {
    if (verbinden !== 'aus' && verbinden !== 'quelle') {
      verbindungsvorschau(weltPunkt(ev));
    }
    return;
  }
  const p = weltPunkt(ev);
  switch (ziehen.art) {
    case 'knoten': {
      const dx = p.x - ziehen.start.x;
      const dy = p.y - ziehen.start.y;
      if (!ziehen.bewegt && Math.hypot(dx, dy) * ansicht.zoom < 3) {
        return;
      }
      ziehen.bewegt = true;
      for (const [id, start] of ziehen.positionen) {
        const k = knotenMitId(id);
        if (!k) {
          continue;
        }
        k.x = schnappen(start.x + dx);
        if (!(modell.typ === 'sequenz' && (k.art === 'lebenslinie' || k.art === 'akteur'))) {
          k.y = schnappen(start.y + dy);
        }
      }
      zeichnen();
      break;
    }
    case 'schieben': {
      const dx = ev.clientX - ziehen.start.x;
      const dy = ev.clientY - ziehen.start.y;
      if (!ziehen.bewegt && Math.hypot(dx, dy) < 3) {
        return;
      }
      ziehen.bewegt = true;
      leinwand.classList.add('schieben');
      ansicht.x = ziehen.ansicht.x + dx;
      ansicht.y = ziehen.ansicht.y + dy;
      welt.setAttribute('transform', `translate(${ansicht.x} ${ansicht.y}) scale(${ansicht.zoom})`);
      break;
    }
    case 'gummiband': {
      const x = Math.min(p.x, ziehen.start.x), y = Math.min(p.y, ziehen.start.y);
      const w = Math.abs(p.x - ziehen.start.x), h = Math.abs(p.y - ziehen.start.y);
      ziehen.rect.setAttribute('x', String(x));
      ziehen.rect.setAttribute('y', String(y));
      ziehen.rect.setAttribute('width', String(w));
      ziehen.rect.setAttribute('height', String(h));
      break;
    }
    case 'groesse': {
      const k = knotenMitId(ziehen.id);
      if (k) {
        k.w = Math.max(20, schnappen(ziehen.w + p.x - ziehen.start.x));
        if (k.art !== 'notiz') {
          k.h = Math.max(4, schnappen(ziehen.h + p.y - ziehen.start.y));
        }
        zeichnen();
      }
      break;
    }
    case 'nachricht': {
      const seq = sequenzMasse(modell);
      const nachrichten = seq.nachrichten;
      const zielIndex = Math.max(0, Math.min(nachrichten.length - 1, Math.round((p.y - seq.oben) / (seq.y(1) - seq.y(0)))));
      const aktuell = nachrichten.indexOf(ziehen.kante);
      if (zielIndex !== aktuell) {
        const a = modell.kanten.indexOf(ziehen.kante);
        modell.kanten.splice(a, 1);
        const ziel = nachrichten[zielIndex];
        const b = modell.kanten.indexOf(ziel);
        modell.kanten.splice(zielIndex > aktuell ? b + 1 : b, 0, ziehen.kante);
        zeichnen();
      }
      break;
    }
  }
});

function ziehenBeenden(ev: PointerEvent): void {
  if (!ziehen) {
    return;
  }
  const z = ziehen;
  ziehen = null;
  leinwand.classList.remove('schieben');
  switch (z.art) {
    case 'knoten':
    case 'groesse':
    case 'nachricht':
      aendern(() => {});
      break;
    case 'schieben':
      if (!z.bewegt) {
        // einfacher Klick auf den Hintergrund: Auswahl aufheben
        if (auswahl.size) {
          auswahl.clear();
          zeichnen();
          panelAufbauen();
        }
      } else {
        statusAktualisieren();
      }
      break;
    case 'gummiband': {
      const p = weltPunkt(ev);
      const r: Rechteck = { x: Math.min(p.x, z.start.x), y: Math.min(p.y, z.start.y), w: Math.abs(p.x - z.start.x), h: Math.abs(p.y - z.start.y) };
      z.rect.remove();
      for (const k of modell.knoten) {
        const kr = rechteck(k);
        if (kr.x >= r.x && kr.y >= r.y && kr.x + kr.w <= r.x + r.w && kr.y + kr.h <= r.y + r.h) {
          auswahl.add(k.id);
        }
      }
      zeichnen();
      panelAufbauen();
      break;
    }
  }
}
leinwand.addEventListener('pointerup', ziehenBeenden);
leinwand.addEventListener('pointercancel', ziehenBeenden);

leinwand.addEventListener('dblclick', ev => {
  const treffer = elementUnter(ev.target);
  if (treffer.knoten || treffer.kante) {
    namensfeldFokussieren();
    (document.getElementById('fKantenText') as HTMLInputElement | null)?.focus();
  }
});

function verbindungsvorschau(p: Punkt): void {
  overlay.querySelector('.verbindungsvorschau')?.remove();
  const von = knotenMitId(verbinden);
  if (!von) {
    return;
  }
  const r = rechteck(von);
  overlay.append(el('line', { x1: r.x + r.w / 2, y1: r.y + r.h / 2, x2: p.x, y2: p.y, class: 'verbindungsvorschau' }));
}

leinwand.addEventListener('wheel', ev => {
  ev.preventDefault();
  const r = leinwand.getBoundingClientRect();
  if (ev.ctrlKey || ev.metaKey) {
    // Strg+Scrollen bzw. Zusammenziehen auf dem Touchpad
    const faktor = Math.exp(-ev.deltaY * 0.01);
    zoomen(faktor, { x: ev.clientX - r.left, y: ev.clientY - r.top });
  } else {
    // Zwei-Finger-Wischen verschiebt die Ansicht; Shift+Rad scrollt waagerecht
    const dx = ev.shiftKey && ev.deltaX === 0 ? ev.deltaY : ev.deltaX;
    const dy = ev.shiftKey && ev.deltaX === 0 ? 0 : ev.deltaY;
    ansicht.x -= dx;
    ansicht.y -= dy;
    welt.setAttribute('transform', `translate(${ansicht.x} ${ansicht.y}) scale(${ansicht.zoom})`);
  }
}, { passive: false });


// ============================================================
// Tastatur
// ============================================================
window.addEventListener('keydown', ev => {
  const strg = ev.ctrlKey || ev.metaKey;
  if (ev.key === 'Escape') {
    if (inEingabe(ev.target)) {
      (ev.target as HTMLElement).blur();
      return;
    }
    if (!$('hilfe').hidden) {
      $('hilfe').hidden = true;
    } else if (verbinden !== 'aus') {
      verbindenBeenden();
    } else if (auswahl.size) {
      auswahl.clear();
      zeichnen();
      panelAufbauen();
    }
    return;
  }
  if (inEingabe(ev.target)) {
    // Enter im Namensfeld: zurück zur Leinwand, damit die nächste Form per Taste eingefügt werden kann
    if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName === 'INPUT') {
      (ev.target as HTMLElement).blur();
      ev.preventDefault();
    }
    if (ev.key === 'Enter' && strg) {
      (ev.target as HTMLElement).blur();
      ev.preventDefault();
    }
    return;
  }
  if (strg && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
    ev.preventDefault();
    rueckgaengig();
    return;
  }
  if (strg && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) {
    ev.preventDefault();
    wiederholen();
    return;
  }
  if (strg && ev.key.toLowerCase() === 'a') {
    ev.preventDefault();
    modell.knoten.forEach(k => auswahl.add(k.id));
    zeichnen();
    panelAufbauen();
    return;
  }
  if (strg && ev.key.toLowerCase() === 'c') {
    kopieren();
    return;
  }
  if (strg && ev.key.toLowerCase() === 'x') {
    kopieren();
    auswahlLoeschen();
    return;
  }
  if (strg && ev.key.toLowerCase() === 'v') {
    einfuegen();
    return;
  }
  if (strg && ev.key.toLowerCase() === 'd') {
    ev.preventDefault();
    duplizieren();
    return;
  }
  if (strg) {
    return;
  }
  const gruppe = gruppeFuer(modell.typ);
  switch (ev.key) {
    case 'Delete':
    case 'Backspace':
      ev.preventDefault();
      auswahlLoeschen();
      return;
    case 'ArrowLeft': ev.preventDefault(); verschieben(ev.shiftKey ? -50 : -10, 0); return;
    case 'ArrowRight': ev.preventDefault(); verschieben(ev.shiftKey ? 50 : 10, 0); return;
    case 'ArrowUp': ev.preventDefault(); verschieben(0, ev.shiftKey ? -50 : -10); return;
    case 'ArrowDown': ev.preventDefault(); verschieben(0, ev.shiftKey ? 50 : 10); return;
    case 'Enter':
    case 'F2':
      ev.preventDefault();
      namensfeldFokussieren();
      (document.getElementById('fKantenText') as HTMLInputElement | null)?.focus();
      return;
    case 'Tab': {
      // Tab wandert durch die Formen
      const liste = modell.knoten;
      if (liste.length === 0) {
        return;
      }
      ev.preventDefault();
      const aktuell = liste.findIndex(k => auswahl.has(k.id));
      const naechster = liste[(aktuell + (ev.shiftKey ? -1 : 1) + liste.length) % liste.length];
      auswahl.clear();
      auswahl.add(naechster.id);
      inSichtBringen(naechster);
      zeichnen();
      panelAufbauen();
      return;
    }
    case '+': zoomen(1.2); return;
    case '-': zoomen(1 / 1.2); return;
    case '0': zoomSetzen(1); return;
    case '?': $('hilfe').hidden = !$('hilfe').hidden; return;
  }
  const taste = ev.key.toLowerCase();
  if (taste === 'f') {
    allesAnzeigen();
  } else if (taste === 'v') {
    if (verbinden === 'aus') {
      verbindenStarten();
    } else {
      verbindenBeenden();
    }
  } else if (taste === 'l') {
    anordnen();
  } else if (taste === 'n') {
    formHinzufuegen(knotenDefinition('notiz'));
  } else if (/^[1-9]$/.test(ev.key) && !ev.altKey) {
    const def = gruppe.formen[Number(ev.key) - 1];
    if (def) {
      formHinzufuegen(def);
    }
  }
});

// ============================================================
// Werkzeugleiste
// ============================================================
$('bUndo').addEventListener('click', rueckgaengig);
$('bRedo').addEventListener('click', wiederholen);
$('bVerbinden').addEventListener('click', () => (verbinden === 'aus' ? verbindenStarten() : verbindenBeenden()));
$('bLayout').addEventListener('click', anordnen);
$('bZoomMinus').addEventListener('click', () => zoomen(1 / 1.2));
$('bZoomPlus').addEventListener('click', () => zoomen(1.2));
$('bZoom100').addEventListener('click', () => zoomSetzen(1));
$('bAnpassen').addEventListener('click', allesAnzeigen);
$('bSvg').addEventListener('click', () => exportieren('svg'));
$('bPng').addEventListener('click', () => exportieren('png'));
$('bHilfe').addEventListener('click', () => { $('hilfe').hidden = !$('hilfe').hidden; });
$('bPalette').addEventListener('click', () => { palette.hidden = !palette.hidden; });
$('bEigenschaften').addEventListener('click', () => { eigenschaften.hidden = !eigenschaften.hidden; });
$<HTMLInputElement>('cAuto').addEventListener('change', ev => { autoVerbinden = (ev.target as HTMLInputElement).checked; });
{
  const s = $<HTMLSelectElement>('sKantenArt');
  for (const art of ALLE_KANTEN) {
    const o = document.createElement('option');
    o.value = art;
    o.textContent = KANTEN_NAMEN[art];
    s.append(o);
  }
  s.addEventListener('change', () => {
    kantenArt = s.value as KantenArt;
    const kanten = ausgewaehlteKanten();
    if (kanten.length && ausgewaehlteKnoten().length === 0) {
      aendern(() => kanten.forEach(k => { k.art = kantenArt; }));
    }
  });
}

$('hilfe').innerHTML = `
<div class="box">
  <h2>UML-Editor – Bedienung</h2>
  <p>Alles ist für Touchpad und Tastatur gemacht: Es gibt keine Rechtsklick-Menüs und nichts muss präzise gezogen werden.</p>
  <h3>Formen</h3>
  <table>
    <tr><td><kbd>1</kbd>–<kbd>9</kbd> oder Klick in der Formenliste</td><td>Form einfügen (wird automatisch unter/neben der ausgewählten Form platziert)</td></tr>
    <tr><td><kbd>Enter</kbd> / <kbd>F2</kbd> / Doppelklick</td><td>Text der ausgewählten Form bearbeiten (rechts)</td></tr>
    <tr><td><kbd>Enter</kbd> im Eingabefeld (<kbd>Esc</kbd> oder <kbd>Strg</kbd>+<kbd>Enter</kbd> in mehrzeiligen Feldern)</td><td>zurück zum Diagramm</td></tr>
    <tr><td><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd></td><td>nächste / vorherige Form auswählen</td></tr>
    <tr><td>Pfeiltasten (+ <kbd>Shift</kbd>)</td><td>Form verschieben (große Schritte)</td></tr>
    <tr><td><kbd>Entf</kbd></td><td>Auswahl löschen</td></tr>
    <tr><td><kbd>Strg</kbd>+<kbd>D</kbd>, <kbd>Strg</kbd>+<kbd>C</kbd>/<kbd>V</kbd></td><td>Duplizieren, Kopieren/Einfügen (auch in ein anderes Diagramm)</td></tr>
    <tr><td><kbd>Strg</kbd>+Klick, <kbd>Shift</kbd>+Ziehen auf leerer Fläche</td><td>mehrere Formen auswählen</td></tr>
    <tr><td><kbd>N</kbd></td><td>Notiz einfügen</td></tr>
  </table>
  <h3>Verbindungen</h3>
  <table>
    <tr><td><kbd>Shift</kbd>+Klick auf eine zweite Form</td><td>Verbindung von der ausgewählten zur angeklickten Form</td></tr>
    <tr><td><kbd>V</kbd> oder „Verbinden“</td><td>Verbindungsmodus: Startform anklicken, dann Zielform. Die Art wählst du in der Werkzeugleiste oder in der Formenliste.</td></tr>
    <tr><td>Auto-Verbinden</td><td>Neue Formen hängen automatisch an der ausgewählten Form (praktisch für Abläufe)</td></tr>
    <tr><td>Klick auf eine Linie</td><td>Verbindung auswählen: Art, Beschriftung, Multiplizitäten, Richtung rechts ändern</td></tr>
  </table>
  <h3>Ansicht</h3>
  <table>
    <tr><td>Zwei-Finger-Wischen / Ziehen auf leerer Fläche</td><td>Ansicht verschieben</td></tr>
    <tr><td><kbd>Strg</kbd>+Scrollen, Zusammenziehen, <kbd>+</kbd>/<kbd>−</kbd></td><td>Zoomen</td></tr>
    <tr><td><kbd>F</kbd> / <kbd>0</kbd></td><td>Alles anzeigen / 100 %</td></tr>
    <tr><td><kbd>L</kbd> oder „Anordnen“</td><td>Automatisches Layout</td></tr>
    <tr><td><kbd>Strg</kbd>+<kbd>Z</kbd> / <kbd>Strg</kbd>+<kbd>Y</kbd></td><td>Rückgängig / Wiederholen</td></tr>
    <tr><td><kbd>Strg</kbd>+<kbd>S</kbd></td><td>Speichern (.uml). SVG/PNG über die Werkzeugleiste exportieren</td></tr>
  </table>
  <p><button id="bHilfeZu" class="primaer">Schließen (Esc)</button></p>
</div>`;
$('bHilfeZu').addEventListener('click', () => { $('hilfe').hidden = true; });
$('hilfe').addEventListener('click', ev => {
  if (ev.target === $('hilfe')) {
    $('hilfe').hidden = true;
  }
});

// ============================================================
// Verbindung zu VS Code
// ============================================================
function laden(daten: unknown): void {
  modell = diagrammPruefen(daten);
  vorher = diagrammSerialisieren(modell);
  undoStapel.length = 0;
  redoStapel.length = 0;
  letzterMergeKey = null;
  auswahl.clear();
  verbinden = 'aus';
  const gruppe = gruppeFuer(modell.typ);
  kantenArt = gruppe.standardKante;
  autoVerbinden = gruppe.autoVerbinden;
  paletteAufbauen();
  werkzeugeAktualisieren();
  allesAnzeigen();
  panelAufbauen();
}

window.addEventListener('message', ev => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'load':
        laden(msg.data);
        break;
      case 'getData':
        vscode.postMessage({ type: 'umlData', requestId: msg.requestId, data: modell });
        break;
      case 'zwischenablage':
        zwischenablage = msg.daten;
        break;
      case 'info':
        hinweisSetzen(msg.text);
        break;
    }
  } catch (e) {
    fehler('Diagramm konnte nicht verarbeitet werden', e);
  }
});

new MutationObserver(() => zeichnen()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
new ResizeObserver(() => zeichnen()).observe(leinwand);

paletteAufbauen();
panelAufbauen();
werkzeugeAktualisieren();
zeichnen();
vscode.postMessage({ type: 'ready' });
