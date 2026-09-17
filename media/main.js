// Läuft in der Webview. PDF.js wurde vorher als <script type="module"> geladen
// und stellt die globalen Objekte pdfjsLib und pdfjsViewer bereit.
import { WERKZEUGE, MARKIERFARBEN } from './werkzeuge.js';

const vscode = acquireVsCodeApi();

// Fehler sichtbar machen: in der Webview als Banner und in VS Code als Meldung.
function fehler(was, e) {
  const text = `${was}: ${e?.stack || e?.message || e}`;
  console.error(text);
  const banner = document.getElementById('fehler');
  if (banner) {
    banner.textContent = text;
    banner.hidden = false;
  }
  vscode.postMessage({ type: 'error', text });
}
window.addEventListener('error', e => fehler('Fehler in der Webview', e.error || e.message));
window.addEventListener('unhandledrejection', e => fehler('Fehler in der Webview', e.reason));

const { getDocument, GlobalWorkerOptions, AnnotationEditorType, AnnotationEditorParamsType,
        SupportedImageMimeTypes } = globalThis.pdfjsLib;
const { PDFViewer, EventBus, PDFLinkService } = globalThis.pdfjsViewer;

// Basis-URL des media/pdfjs-Ordners (kommt aus dem HTML, endet mit "/")
const basis = document.body.dataset.pdfjs;

const eventBus = new EventBus();
const linkService = new PDFLinkService({ eventBus });
const viewer = new PDFViewer({
  container: document.getElementById('viewerContainer'),
  eventBus,
  linkService,
  // Ohne diese Angabe wirft das Markier-Werkzeug einen Fehler
  annotationEditorHighlightColors: MARKIERFARBEN.map(([name, farbe]) => `${name}=${farbe}`).join(','),
});
linkService.setViewer(viewer);

let pdfDocument = null;

// Den Worker laden wir selbst und reichen ihn als blob:-URL weiter.
// Direkt aus der Webview heraus käme PDF.js nicht an die vscode-resource-URL:
// im Worker greift der Service Worker nicht, der diese Adressen bedient.
let workerSrc = null;
async function workerVorbereiten() {
  if (!workerSrc) {
    const quelltext = await fetch(basis + 'pdf.worker.mjs').then(a => a.blob());
    workerSrc = URL.createObjectURL(quelltext);
    GlobalWorkerOptions.workerSrc = workerSrc;
  }
}

async function load(data) {
  await workerVorbereiten();

  pdfDocument = await getDocument({
    data,
    wasmUrl: basis + 'wasm/',                   // für eingescannte PDFs (JBIG2, JPEG 2000)
    standardFontDataUrl: basis + 'standard_fonts/',
    cMapUrl: basis + 'cmaps/',
  }).promise;

  // Feuert bei der ersten Änderung; saveDocument() setzt den Zustand wieder zurück
  pdfDocument.annotationStorage.onSetModified = () => vscode.postMessage({ type: 'dirty' });

  viewer.setDocument(pdfDocument);
  linkService.setDocument(pdfDocument);
}

eventBus.on('pagesinit', () => {
  viewer.currentScaleValue = 'page-width';
});

// Nachrichten von der Extension
window.addEventListener('message', async ({ data: msg }) => {
  try {
    if (msg.type === 'load') {
      await load(msg.data);
    } else if (msg.type === 'bild') {
      bildEinfuegen(msg);
    } else if (msg.type === 'getData') {
      const bytes = pdfDocument.annotationStorage.size > 0
        ? await pdfDocument.saveDocument()   // PDF inklusive neuer Anmerkungen
        : await pdfDocument.getData();       // nichts geändert: Original-Bytes
      vscode.postMessage({ type: 'pdfData', requestId: msg.requestId, data: bytes });
    }
  } catch (e) {
    const wobei = { load: 'PDF konnte nicht geladen werden', bild: 'Bild konnte nicht eingefügt werden' };
    fehler(wobei[msg.type] ?? 'PDF konnte nicht gespeichert werden', e);
  }
});

// Endungen wie im Dateidialog der Extension (siehe pdfEditor.ts).
const BILD_MIME = {
  png: 'image/png', apng: 'image/apng', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
  svg: 'image/svg+xml', ico: 'image/x-icon',
};

/**
 * Fügt ein von der Extension ausgewähltes Bild ein.
 * PDF.js nimmt Bilder über Drag-and-drop entgegen: sein "drop"-Horcher am Dokument
 * reicht die Datei an den StampEditor der aktuellen Seite weiter. Wir bauen dieses
 * Ereignis nach, statt den Dateidialog von PDF.js zu benutzen.
 */
function bildEinfuegen({ data, name }) {
  const mime = BILD_MIME[name.split('.').pop().toLowerCase()];
  if (!SupportedImageMimeTypes.includes(mime)) {
    fehler('Bild konnte nicht eingefügt werden', new Error(`${name}: dieses Bildformat kann PDF.js nicht einbetten.`));
    return;
  }
  waehleWerkzeug('STAMP');   // sorgt dafür, dass PDF.js eine aktuelle Seitenebene hat

  const ablage = new DataTransfer();
  ablage.items.add(new File([data], name, { type: mime }));
  document.dispatchEvent(new DragEvent('drop', { dataTransfer: ablage, bubbles: true, cancelable: true }));
}

// ---------------------------------------------------------------------------
// Werkzeugleiste und Optionen
// ---------------------------------------------------------------------------

// Zahl -> Name, um Meldungen von PDF.js ("annotationeditorparamschanged")
// wieder einer unserer Optionen zuordnen zu können.
const PARAM_NAME = Object.fromEntries(
  Object.entries(AnnotationEditorParamsType).map(([name, zahl]) => [zahl, name])
);

// Zuletzt benutzte Einstellungen überleben den Tab-Wechsel und den Neustart.
const werte = { ...Object.fromEntries(
  WERKZEUGE.flatMap(w => w.optionen ?? [])
    .filter(o => o.param)
    .map(o => [o.param, o.standard])
), ...(vscode.getState()?.werte ?? {}) };

// Pro Option eine Funktion, die nur die Anzeige nachzieht (ohne PDF.js zu melden).
const anzeigen = new Map();
const werkzeugLeiste = document.getElementById('werkzeuge');
const optionenLeiste = document.getElementById('optionen');
const optionenInhalt = document.getElementById('optionenInhalt');

const el = (tag, klasse, inhalt) => {
  const knoten = document.createElement(tag);
  if (klasse) { knoten.className = klasse; }
  if (inhalt !== undefined) { knoten.textContent = inhalt; }
  return knoten;
};

/** Wert übernehmen: merken, an PDF.js melden, Anzeige nachziehen. */
function setzeWert(param, wert, { melden = true } = {}) {
  werte[param] = wert;
  vscode.setState({ werte });
  anzeigen.get(param)?.(wert);
  aktualisiereAbhaengige();
  if (melden) {
    eventBus.dispatch('switchannotationeditorparams', {
      source: null,
      type: AnnotationEditorParamsType[param],
      value: wert,
    });
  }
}

// --- Bausteine für die einzelnen Optionsarten ---

function baueFarbe(option) {
  const feld = el('div', 'feld');
  feld.append(el('span', 'beschriftung', option.name));

  const reihe = el('div', 'farben');
  const knoepfe = new Map();
  for (const [name, farbe] of option.farben) {
    const knopf = el('button', 'farbe');
    knopf.type = 'button';
    knopf.title = name;
    knopf.setAttribute('aria-label', name);
    knopf.style.setProperty('--farbe', farbe);
    knopf.addEventListener('click', () => setzeWert(option.param, farbe));
    knoepfe.set(farbe.toLowerCase(), knopf);
    reihe.append(knopf);
  }

  // Eigene Farbe: der native Farbwähler, als runder Knopf getarnt
  let eigene = null;
  if (option.eigene) {
    const huelle = el('label', 'farbe eigene');
    huelle.title = 'Eigene Farbe';
    eigene = el('input');
    eigene.type = 'color';
    eigene.addEventListener('input', () => setzeWert(option.param, eigene.value));
    huelle.append(eigene);
    reihe.append(huelle);
  }

  feld.append(reihe);
  anzeigen.set(option.param, wert => {
    for (const [farbe, knopf] of knoepfe) {
      knopf.classList.toggle('aktiv', farbe === String(wert).toLowerCase());
    }
    if (eigene) {
      const bekannt = knoepfe.has(String(wert).toLowerCase());
      eigene.value = wert;
      eigene.parentElement.classList.toggle('aktiv', !bekannt);
    }
  });
  return feld;
}

function baueZahl(option) {
  const feld = el('div', 'feld');
  feld.append(el('span', 'beschriftung', option.name));

  const reihe = el('div', 'zahl');
  const faktor = option.anzeigeFaktor ?? 1;
  // Auf ganze Schritte runden, sonst kommen bei Kommaschritten Werte wie 0.15000000000000002 heraus.
  const begrenzen = z => Number(Math.min(option.max, Math.max(option.min, Math.round(z / option.schritt) * option.schritt)).toFixed(4));
  const beschriften = z => `${Math.round(z * faktor)} ${option.einheit}`;

  const stufen = [];
  if (option.stufen) {
    const gruppe = el('div', 'stufen');
    for (const [name, wert] of option.stufen) {
      const knopf = el('button', 'stufe', name);
      knopf.type = 'button';
      knopf.title = `${option.name}: ${beschriften(wert)}`;
      knopf.addEventListener('click', () => setzeWert(option.param, wert));
      stufen.push([wert, knopf]);
      gruppe.append(knopf);
    }
    reihe.append(gruppe);
  }

  const schieber = el('input', 'schieber');
  schieber.type = 'range';
  schieber.min = option.min;
  schieber.max = option.max;
  schieber.step = option.schritt;
  schieber.setAttribute('aria-label', option.name);
  schieber.addEventListener('input', () => setzeWert(option.param, Number(schieber.value)));

  const anzeige = el('output', 'wert');

  const schritt = (richtung) => {
    const knopf = el('button', 'schritt', richtung < 0 ? '−' : '+');
    knopf.type = 'button';
    knopf.title = richtung < 0 ? 'Kleiner' : 'Größer';
    knopf.addEventListener('click', () => setzeWert(option.param, begrenzen(werte[option.param] + richtung * option.schritt)));
    return knopf;
  };

  reihe.append(schritt(-1), schieber, schritt(1), anzeige);
  feld.append(reihe);

  anzeigen.set(option.param, wert => {
    schieber.value = wert;
    anzeige.textContent = beschriften(wert);
    for (const [stufenWert, knopf] of stufen) {
      knopf.classList.toggle('aktiv', stufenWert === wert);
    }
  });
  return feld;
}

function baueSchalter(option) {
  const feld = el('div', 'feld');
  const huelle = el('label', 'schalter');
  const kasten = el('input');
  kasten.type = 'checkbox';
  kasten.addEventListener('change', () => setzeWert(option.param, kasten.checked));
  huelle.append(kasten, el('span', 'schaltbahn'), el('span', 'beschriftung', option.name));
  feld.append(huelle);
  anzeigen.set(option.param, wert => { kasten.checked = Boolean(wert); });
  return feld;
}

function baueVorschau(option) {
  const feld = el('div', 'feld vorschaufeld');
  feld.append(el('span', 'beschriftung', option.name));
  const text = el('div', 'vorschau', option.text);
  feld.append(text);

  // Die Vorschau zeigt Farbe und Größe direkt. Über 32px wird sie gedeckelt,
  // damit die Leiste nicht springt - die genaue Zahl steht ja am Schieber.
  const nachziehen = () => {
    text.style.color = werte[option.farbe];
    text.style.fontSize = `${Math.min(32, werte[option.groesse])}px`;
  };
  for (const param of [option.groesse, option.farbe]) {
    const vorher = anzeigen.get(param);
    anzeigen.set(param, wert => { vorher?.(wert); nachziehen(); });
  }
  return feld;
}

function baueAktion(option) {
  const feld = el('div', 'feld');
  const knopf = el('button', 'aktion', option.knopf);
  knopf.type = 'button';
  knopf.addEventListener('click', () => vscode.postMessage({ type: option.aktion }));
  feld.append(knopf);
  if (option.hinweis) { feld.append(el('span', 'beschriftung', option.hinweis)); }
  return feld;
}

const BAUER = { farbe: baueFarbe, zahl: baueZahl, schalter: baueSchalter, vorschau: baueVorschau, aktion: baueAktion };

// --- Leisten aufbauen ---

const werkzeugKnoepfe = new Map();
const optionsSaetze = new Map();
const abhaengige = [];

for (const werkzeug of WERKZEUGE) {
  const knopf = el('button', 'werkzeug');
  knopf.type = 'button';
  knopf.title = `${werkzeug.name} (${werkzeug.taste}) – ${werkzeug.hinweis}`;
  knopf.innerHTML = werkzeug.icon;
  knopf.append(el('span', 'name', werkzeug.name), el('kbd', '', werkzeug.taste));
  knopf.addEventListener('click', () => {
    waehleWerkzeug(werkzeug.mode);
    if (werkzeug.aktion) { vscode.postMessage({ type: werkzeug.aktion }); }
  });
  werkzeugLeiste.append(knopf);
  werkzeugKnoepfe.set(werkzeug.mode, knopf);

  if (!werkzeug.optionen) { continue; }
  const satz = el('div', 'satz');
  satz.hidden = true;
  for (const option of werkzeug.optionen) {
    const feld = BAUER[option.art](option);
    if (option.nurWenn) { abhaengige.push([feld, option.nurWenn]); }
    satz.append(feld);
  }
  optionenInhalt.append(satz);
  optionsSaetze.set(werkzeug.mode, satz);
}

/** Optionen ausblenden, die gerade nicht greifen (z. B. Markerbreite ohne freies Übermalen). */
function aktualisiereAbhaengige() {
  for (const [feld, bedingung] of abhaengige) {
    feld.classList.toggle('inaktiv', werte[bedingung.param] !== bedingung.wert);
  }
}

function waehleWerkzeug(mode) {
  viewer.annotationEditorMode = { mode: AnnotationEditorType[mode] };
}

// Anzeige mit dem Startzustand füllen
for (const [param, nachziehen] of anzeigen) { nachziehen(werte[param]); }
aktualisiereAbhaengige();

eventBus.on('annotationeditormodechanged', ({ mode }) => {
  for (const [name, knopf] of werkzeugKnoepfe) {
    knopf.classList.toggle('aktiv', AnnotationEditorType[name] === mode);
  }

  let offen = false;
  for (const [name, satz] of optionsSaetze) {
    const sichtbar = AnnotationEditorType[name] === mode;
    satz.hidden = !sichtbar;
    offen ||= sichtbar;
  }
  optionenLeiste.classList.toggle('offen', offen);

  // PDF.js legt die Editoren erst beim ersten Benutzen an, deshalb bekommt es
  // die gemerkten Einstellungen bei jedem Werkzeugwechsel erneut gemeldet.
  const werkzeug = WERKZEUGE.find(w => AnnotationEditorType[w.mode] === mode);
  for (const option of werkzeug?.optionen ?? []) {
    if (option.param) { setzeWert(option.param, werte[option.param]); }
  }
});

// PDF.js meldet "annotationeditorparamschanged" in zwei Fällen: für die Eigenschaften
// einer ausgewählten Anmerkung - und beim Moduswechsel für seine eigenen Klassen-
// Vorgaben. Letztere würden unsere gemerkten Einstellungen überschreiben, deshalb
// hören wir nur zu, solange tatsächlich eine Anmerkung ausgewählt ist.
let anmerkungAusgewaehlt = false;
eventBus.on('editingstateschanged', ({ details }) => {
  anmerkungAusgewaehlt = Boolean(details?.hasSelectedEditor);
});

// Wählt man eine vorhandene Anmerkung aus, zeigt die Leiste deren Eigenschaften.
eventBus.on('annotationeditorparamschanged', ({ details }) => {
  if (!anmerkungAusgewaehlt) { return; }
  for (const [typ, wert] of details ?? []) {
    const param = PARAM_NAME[typ];
    if (param && param in werte) {
      werte[param] = wert;
      anzeigen.get(param)?.(wert);
    }
  }
  aktualisiereAbhaengige();
});

// Tastenkürzel - aber nie, während jemand in ein Textfeld schreibt.
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) { return; }
  const ziel = e.target;
  if (ziel?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(ziel?.tagName)) { return; }

  if (e.key === 'Escape') {
    waehleWerkzeug('NONE');
    return;
  }
  const werkzeug = WERKZEUGE.find(w => w.taste.toLowerCase() === e.key.toLowerCase());
  if (werkzeug) {
    e.preventDefault();
    waehleWerkzeug(werkzeug.mode);
    if (werkzeug.aktion) { vscode.postMessage({ type: werkzeug.aktion }); }
  }
});

vscode.postMessage({ type: 'ready' });
