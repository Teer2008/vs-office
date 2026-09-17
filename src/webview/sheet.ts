// Läuft in der Webview des Tabellen-Editors. Wird von esbuild nach media/sheet/sheet.js gebündelt.
import { createUniver, LocaleType, mergeLocales, CommandType } from '@univerjs/presets';
import type { IWorkbookData, ICellData } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/presets/preset-sheets-core';
import deDE from '@univerjs/presets/preset-sheets-core/locales/de-DE';
import '@univerjs/presets/lib/styles/preset-sheets-core.css';

declare function acquireVsCodeApi(): { postMessage(nachricht: unknown): void };
const vscode = acquireVsCodeApi();

function fehler(was: string, e: unknown): void {
  const text = `${was}: ${(e as Error)?.stack || (e as Error)?.message || e}`;
  console.error(text);
  vscode.postMessage({ type: 'error', text });
}
window.addEventListener('error', e => fehler('Fehler in der Webview', e.error || e.message));
window.addEventListener('unhandledrejection', e => fehler('Fehler in der Webview', e.reason));

const { univerAPI } = createUniver({
  locale: LocaleType.DE_DE,
  locales: { [LocaleType.DE_DE]: mergeLocales(deDE) },
  presets: [UniverSheetsCorePreset({ container: 'app' })],
});

// Univer-Farbschema an das VS-Code-Theme angleichen (Klasse am body: vscode-dark / vscode-light / vscode-high-contrast)
function themeAngleichen(): void {
  const dunkel = document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
  univerAPI.toggleDarkMode(dunkel);
}
themeAngleichen();
new MutationObserver(themeAngleichen).observe(document.body, { attributes: true, attributeFilter: ['class'] });

let unitId: string | undefined;
let ladephase = false;
let dirtyGemeldet = false;

function laden(daten: IWorkbookData): void {
  ladephase = true;
  try {
    if (unitId) {
      univerAPI.disposeUnit(unitId);
    }
    unitId = univerAPI.createWorkbook(daten).getId();
    dirtyGemeldet = false;
  } finally {
    // Nachlaufende Mutationen vom Aufbau (Zeilenhöhen usw.) sollen den Tab nicht als geändert markieren
    setTimeout(() => { ladephase = false; }, 300);
  }
}

/** Aktueller Zustand der Mappe. Formeln, die Univer intern nur als Verweis (si) hält, werden ausgeschrieben. */
function snapshot(): IWorkbookData {
  const mappe = univerAPI.getActiveWorkbook();
  if (!mappe) {
    throw new Error('Keine Tabelle geladen.');
  }
  const daten = mappe.save();
  for (const [sheetId, blatt] of Object.entries(daten.sheets)) {
    const fBlatt = mappe.getSheetBySheetId(sheetId);
    for (const [r, zeile] of Object.entries(blatt.cellData ?? {})) {
      for (const [c, zelle] of Object.entries(zeile as Record<string, ICellData>)) {
        if (zelle?.si && !zelle.f) {
          const f = fBlatt?.getRange(Number(r), Number(c)).getFormula();
          if (f) {
            zelle.f = f;
          }
        }
      }
    }
  }
  return daten;
}

// Mutationen, die nichts am Inhalt ändern
const HARMLOS = new Set([
  'sheet.mutation.set-worksheet-row-auto-height',
  'sheet.mutation.set-worksheet-row-is-auto-height',
  'sheet.mutation.empty',
]);

univerAPI.addEvent(univerAPI.Event.CommandExecuted, e => {
  // Formel-Neuberechnung (formula.mutation.*), Auswahl und Scrollen (sheet.operation.*) zählen nicht als Änderung
  if (ladephase || dirtyGemeldet || e.type !== CommandType.MUTATION) {
    return;
  }
  if (!e.id.startsWith('sheet.mutation.') || HARMLOS.has(e.id)) {
    return;
  }
  // Formel-Ergebnisse schreibt Univer per set-range-values in die Zellen - auch direkt nach dem Laden
  if ((e.options as Record<string, unknown> | undefined)?.fromFormula) {
    return;
  }
  dirtyGemeldet = true;
  vscode.postMessage({ type: 'dirty', grund: e.id });
});

window.addEventListener('message', ev => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'load':
        laden(msg.data);
        break;
      case 'getData':
        vscode.postMessage({ type: 'sheetData', requestId: msg.requestId, data: snapshot() });
        dirtyGemeldet = false;
        break;
    }
  } catch (e) {
    fehler('Tabelle konnte nicht verarbeitet werden', e);
  }
});

vscode.postMessage({ type: 'ready' });
