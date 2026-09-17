import { Workbook, Worksheet, Cell, ValueType, CellValue, Style, BorderStyle, Color } from 'exceljs';
import type { IWorkbookData, IWorksheetData, ICellData, IStyleData, IRange, IBorderStyleData } from '@univerjs/presets';

/**
 * Übersetzt zwischen .xlsx (gelesen/geschrieben mit ExcelJS) und dem
 * Datenmodell von Univer, das die Webview anzeigt.
 *
 * Mitgenommen werden: Werte, Formeln (mit zuletzt berechnetem Ergebnis), Zahlenformate,
 * Schrift, Farben, Rahmen, Ausrichtung, Verbundzellen, Spaltenbreiten, Zeilenhöhen,
 * ausgeblendete Zeilen/Spalten, fixierte Zeilen/Spalten, Tab-Farbe, ausgeblendete Blätter.
 * Nicht mitgenommen: Bilder, Diagramme, Kommentare, Datenüberprüfung, bedingte Formatierung.
 */

// Zahlenwerte der Univer-Enums. Als Konstanten statt Import, damit @univerjs/core
// nicht mit in das Extension-Bundle wandert.
const LOCALE_DE = 'deDE';                          // LocaleType.DE_DE
const ZELLTYP = { STRING: 1, NUMBER: 2, BOOLEAN: 3 } as const;   // CellValueType
const JA = 1;                                      // BooleanNumber.TRUE
const WRAP = 3;                                    // WrapStrategy.WRAP

/** Univer BorderStyleTypes (Index) -> ExcelJS BorderStyle */
const RAHMEN: (BorderStyle | undefined)[] = [
  undefined, 'thin', 'hair', 'dotted', 'dashed', 'dashDot', 'dashDotDot', 'double',
  'medium', 'mediumDashed', 'mediumDashDot', 'mediumDashDotDot', 'slantDashDot', 'thick',
];
const HORIZONTAL: Record<number, Style['alignment']['horizontal']> = { 1: 'left', 2: 'center', 3: 'right', 4: 'justify', 6: 'distributed' };
const VERTIKAL: Record<number, Style['alignment']['vertical']> = { 1: 'top', 2: 'middle', 3: 'bottom' };

function schluessel(tabelle: Record<number, string | undefined>, wert: string | undefined): number | undefined {
  const eintrag = Object.entries(tabelle).find(([, v]) => v === wert);
  return eintrag ? Number(eintrag[0]) : undefined;
}

// ---- Farben: Univer "#RRGGBB" / "rgb(r, g, b)"  <->  ExcelJS "AARRGGBB" ----

function argbZuRgb(farbe: Partial<Color> | undefined): string | undefined {
  // Theme-Farben ohne konkreten Wert können wir nicht auflösen
  if (!farbe?.argb || farbe.argb.length < 6) {
    return undefined;
  }
  return `#${farbe.argb.slice(-6).toUpperCase()}`;
}

function rgbZuArgb(rgb: string | null | undefined | void): Partial<Color> | undefined {
  if (!rgb) {
    return undefined;
  }
  const hex = rgb.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) {
    return { argb: `FF${hex.toUpperCase()}` };
  }
  const kurz = rgb.match(/^#([0-9a-f]{3})$/i)?.[1];
  if (kurz) {
    return { argb: `FF${[...kurz].map(c => c + c).join('').toUpperCase()}` };
  }
  const teile = rgb.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (teile) {
    return { argb: 'FF' + teile.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase() };
  }
  return undefined;
}

// ---- Maße: Univer rechnet in Pixeln, Excel in Zeichen (Spalten) und Punkt (Zeilen) ----

const pxZuZeichen = (px: number) => Math.max(0, (px - 5) / 7);
const zeichenZuPx = (zeichen: number) => Math.round(zeichen * 7 + 5);
const pxZuPunkt = (px: number) => px * 0.75;
const punktZuPx = (punkt: number) => Math.round(punkt / 0.75);

/** Excel zählt Tage seit dem 30.12.1899; so speichert auch Univer ein Datum (plus Zahlenformat) */
const EXCEL_EPOCHE = Date.UTC(1899, 11, 30);
const datumZuSerial = (d: Date) => (d.getTime() - EXCEL_EPOCHE) / 86_400_000;

// ============================================================
// xlsx -> Univer
// ============================================================

export async function xlsxZuUniver(bytes: Uint8Array, name: string): Promise<IWorkbookData> {
  const mappe = new Workbook();
  await mappe.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

  const sheets: Record<string, Partial<IWorksheetData>> = {};
  const sheetOrder: string[] = [];
  mappe.eachSheet((blatt, id) => {
    const key = `blatt-${id}`;
    sheets[key] = blattZuUniver(blatt, key);
    sheetOrder.push(key);
  });
  if (sheetOrder.length === 0) {
    sheets['blatt-1'] = leeresBlatt('blatt-1', 'Tabelle1');
    sheetOrder.push('blatt-1');
  }

  return { id: 'mappe', name, appVersion: '', locale: LOCALE_DE as IWorkbookData['locale'], styles: {}, sheetOrder, sheets };
}

export function leereMappe(name: string): IWorkbookData {
  return {
    id: 'mappe', name, appVersion: '', locale: LOCALE_DE as IWorkbookData['locale'], styles: {},
    sheetOrder: ['blatt-1'], sheets: { 'blatt-1': leeresBlatt('blatt-1', 'Tabelle1') },
  };
}

function leeresBlatt(id: string, name: string): Partial<IWorksheetData> {
  return { id, name, rowCount: 1000, columnCount: 26, cellData: {}, mergeData: [], rowData: {}, columnData: {} };
}

function blattZuUniver(blatt: Worksheet, id: string): Partial<IWorksheetData> {
  const cellData: Record<number, Record<number, ICellData>> = {};
  const rowData: Record<number, { h?: number; hd?: number }> = {};
  const columnData: Record<number, { w?: number; hd?: number }> = {};

  // includeEmpty: auch Zellen ohne Wert können Formatierung tragen (z.B. Rahmen einer leeren Tabelle)
  blatt.eachRow({ includeEmpty: true }, (zeile, nr) => {
    const r = nr - 1;
    if (zeile.height) {
      rowData[r] = { ...rowData[r], h: punktZuPx(zeile.height) };
    }
    if (zeile.hidden) {
      rowData[r] = { ...rowData[r], hd: JA };
    }
    zeile.eachCell({ includeEmpty: true }, (zelle, spalte) => {
      const daten = zelleZuUniver(zelle);
      if (daten) {
        (cellData[r] ??= {})[spalte - 1] = daten;
      }
    });
  });

  blatt.columns?.forEach((spalte, i) => {
    if (spalte.width) {
      columnData[i] = { ...columnData[i], w: zeichenZuPx(spalte.width) };
    }
    if (spalte.hidden) {
      columnData[i] = { ...columnData[i], hd: JA };
    }
  });

  // ExcelJS legt Verbundzellen als Bereichstexte ("A1:B2") im Modell ab
  const mergeData: IRange[] = (blatt.model.merges ?? []).map(bereichZuRange);

  const ansicht = blatt.views?.[0];
  const ergebnis: Partial<IWorksheetData> = {
    id,
    name: blatt.name,
    rowCount: Math.max(1000, blatt.rowCount + 100),
    columnCount: Math.max(26, blatt.columnCount + 10),
    cellData, rowData, columnData, mergeData,
    hidden: blatt.state === 'hidden' || blatt.state === 'veryHidden' ? JA : 0,
    showGridlines: ansicht && ansicht.showGridLines === false ? 0 : JA,
  };
  const tabFarbe = argbZuRgb(blatt.properties?.tabColor);
  if (tabFarbe) {
    ergebnis.tabColor = tabFarbe;
  }
  if (ansicht?.state === 'frozen') {
    const xSplit = ansicht.xSplit ?? 0;
    const ySplit = ansicht.ySplit ?? 0;
    ergebnis.freeze = { xSplit, ySplit, startRow: ySplit, startColumn: xSplit };
  }
  return ergebnis;
}

function zelleZuUniver(zelle: Cell): ICellData | undefined {
  const daten: ICellData = {};
  const wert = zelle.value;

  switch (zelle.type) {
    case ValueType.Null:
    case ValueType.Merge:   // Nebenzellen eines Verbunds tragen keinen eigenen Inhalt
      break;
    case ValueType.Formula:
      // Gilt auch für geteilte Formeln: zelle.formula löst sie auf die jeweilige Zelle auf
      daten.f = `=${zelle.formula}`;
      Object.assign(daten, wertZuUniver(zelle.result));
      break;
    default:
      Object.assign(daten, wertZuUniver(wert));
  }

  const style = stilZuUniver(zelle);
  if (style) {
    daten.s = style;
  }
  return Object.keys(daten).length ? daten : undefined;
}

function wertZuUniver(wert: CellValue | undefined): Pick<ICellData, 'v' | 't'> {
  if (wert === null || wert === undefined) {
    return {};
  }
  if (typeof wert === 'number') {
    return { v: wert, t: ZELLTYP.NUMBER };
  }
  if (typeof wert === 'boolean') {
    return { v: wert ? 1 : 0, t: ZELLTYP.BOOLEAN };
  }
  if (typeof wert === 'string') {
    return { v: wert, t: ZELLTYP.STRING };
  }
  if (wert instanceof Date) {
    return { v: datumZuSerial(wert), t: ZELLTYP.NUMBER };
  }
  if ('richText' in wert) {
    return { v: wert.richText.map(t => t.text).join(''), t: ZELLTYP.STRING };
  }
  if ('hyperlink' in wert) {
    return { v: wert.text, t: ZELLTYP.STRING };
  }
  if ('error' in wert) {
    return { v: wert.error, t: ZELLTYP.STRING };
  }
  return {};
}

function stilZuUniver(zelle: Cell): IStyleData | undefined {
  const s: IStyleData = {};
  const { font, fill, border, alignment } = zelle.style;

  // Datumszellen bringen ihr Format mit; sonst nur, wenn eines gesetzt ist
  if (zelle.numFmt) {
    s.n = { pattern: zelle.numFmt };
  } else if (zelle.type === ValueType.Date) {
    s.n = { pattern: 'yyyy-mm-dd' };
  }
  if (font) {
    if (font.name) { s.ff = font.name; }
    if (font.size) { s.fs = font.size; }
    if (font.bold) { s.bl = JA; }
    if (font.italic) { s.it = JA; }
    if (font.underline) { s.ul = { s: JA }; }
    if (font.strike) { s.st = { s: JA }; }
    const farbe = argbZuRgb(font.color);
    if (farbe) { s.cl = { rgb: farbe }; }
  }
  if (fill?.type === 'pattern' && fill.pattern === 'solid') {
    const farbe = argbZuRgb(fill.fgColor);
    if (farbe) { s.bg = { rgb: farbe }; }
  }
  if (border) {
    const bd: Record<string, IBorderStyleData> = {};
    for (const [seite, key] of [['top', 't'], ['right', 'r'], ['bottom', 'b'], ['left', 'l']] as const) {
      const rand = border[seite];
      const index = rand?.style ? RAHMEN.indexOf(rand.style) : -1;
      if (index > 0) {
        bd[key] = { s: index, cl: { rgb: argbZuRgb(rand!.color) ?? '#000000' } };
      }
    }
    if (Object.keys(bd).length) { s.bd = bd; }
  }
  if (alignment) {
    const ht = schluessel(HORIZONTAL, alignment.horizontal);
    if (ht) { s.ht = ht; }
    const vt = schluessel(VERTIKAL, alignment.vertical);
    if (vt) { s.vt = vt; }
    if (alignment.wrapText) { s.tb = WRAP; }
    if (typeof alignment.textRotation === 'number' && alignment.textRotation) { s.tr = { a: alignment.textRotation }; }
  }
  return Object.keys(s).length ? s : undefined;
}

/** "A1:C3" -> { startRow: 0, startColumn: 0, endRow: 2, endColumn: 2 } */
function bereichZuRange(bereich: string): IRange {
  const [von, bis] = bereich.split(':');
  const a = adresseZuRc(von);
  const b = adresseZuRc(bis ?? von);
  return { startRow: a.r, startColumn: a.c, endRow: b.r, endColumn: b.c };
}

function adresseZuRc(adresse: string): { r: number; c: number } {
  const m = adresse.match(/^\$?([A-Z]+)\$?(\d+)$/i);
  if (!m) {
    throw new Error(`Ungültige Zelladresse: ${adresse}`);
  }
  let c = 0;
  for (const buchstabe of m[1].toUpperCase()) {
    c = c * 26 + (buchstabe.charCodeAt(0) - 64);
  }
  return { r: Number(m[2]) - 1, c: c - 1 };
}

// ============================================================
// Univer -> xlsx
// ============================================================

export async function univerZuXlsx(daten: IWorkbookData): Promise<Uint8Array> {
  const mappe = new Workbook();
  for (const key of daten.sheetOrder) {
    const blatt = daten.sheets[key];
    if (blatt) {
      blattZuXlsx(mappe, blatt, daten.styles);
    }
  }
  if (mappe.worksheets.length === 0) {
    mappe.addWorksheet('Tabelle1');
  }
  return new Uint8Array(await mappe.xlsx.writeBuffer());
}

function blattZuXlsx(mappe: Workbook, blatt: Partial<IWorksheetData>, styles: IWorkbookData['styles']): void {
  const ws = mappe.addWorksheet(blatt.name || 'Tabelle', {
    state: blatt.hidden === JA ? 'hidden' : 'visible',
    views: [{
      showGridLines: blatt.showGridlines !== 0,
      ...(blatt.freeze && (blatt.freeze.xSplit > 0 || blatt.freeze.ySplit > 0)
        ? { state: 'frozen' as const, xSplit: blatt.freeze.xSplit, ySplit: blatt.freeze.ySplit }
        : {}),
    }],
  });
  const tabFarbe = rgbZuArgb(blatt.tabColor);
  if (tabFarbe) {
    ws.properties.tabColor = tabFarbe;
  }

  for (const [r, zeile] of Object.entries(blatt.cellData ?? {})) {
    for (const [c, zelle] of Object.entries(zeile ?? {})) {
      if (zelle) {
        zelleZuXlsx(ws.getCell(Number(r) + 1, Number(c) + 1), zelle, styles);
      }
    }
  }

  for (const [r, daten] of Object.entries(blatt.rowData ?? {})) {
    if (!daten) { continue; }
    const zeile = ws.getRow(Number(r) + 1);
    if (daten.h) { zeile.height = pxZuPunkt(daten.h); }
    if (daten.hd === JA) { zeile.hidden = true; }
  }
  for (const [c, daten] of Object.entries(blatt.columnData ?? {})) {
    if (!daten) { continue; }
    const spalte = ws.getColumn(Number(c) + 1);
    if (daten.w) { spalte.width = pxZuZeichen(daten.w); }
    if (daten.hd === JA) { spalte.hidden = true; }
  }

  for (const m of blatt.mergeData ?? []) {
    if (m.endRow > m.startRow || m.endColumn > m.startColumn) {
      ws.mergeCells(m.startRow + 1, m.startColumn + 1, m.endRow + 1, m.endColumn + 1);
    }
  }
}

function zelleZuXlsx(ziel: Cell, zelle: ICellData, styles: IWorkbookData['styles']): void {
  // Rich-Text (p) enthält den Text als dataStream mit "\r\n" am Ende
  const wert = zelle.p?.body?.dataStream !== undefined ? zelle.p.body.dataStream.replace(/\r\n$/, '') : zelle.v;
  let ergebnis: CellValue = wert ?? null;
  if (zelle.t === ZELLTYP.BOOLEAN && wert !== undefined && wert !== null) {
    ergebnis = Boolean(Number(wert));
  }

  if (zelle.f?.startsWith('=')) {
    ziel.value = { formula: zelle.f.slice(1), result: ergebnis as number | string | boolean | undefined };
  } else if (ergebnis !== null) {
    ziel.value = ergebnis;
  }

  const stil = typeof zelle.s === 'string' ? styles[zelle.s] : zelle.s;
  if (stil) {
    stilZuXlsx(ziel, stil);
  }
}

function stilZuXlsx(ziel: Cell, s: IStyleData): void {
  if (s.n?.pattern) {
    ziel.numFmt = s.n.pattern;
  }
  const font: Partial<Style['font']> = {};
  if (s.ff) { font.name = s.ff; }
  if (s.fs) { font.size = s.fs; }
  if (s.bl === JA) { font.bold = true; }
  if (s.it === JA) { font.italic = true; }
  if (s.ul?.s === JA) { font.underline = true; }
  if (s.st?.s === JA) { font.strike = true; }
  const schriftfarbe = rgbZuArgb(s.cl?.rgb);
  if (schriftfarbe) { font.color = schriftfarbe; }
  if (Object.keys(font).length) { ziel.font = font; }

  const hintergrund = rgbZuArgb(s.bg?.rgb);
  if (hintergrund) {
    ziel.fill = { type: 'pattern', pattern: 'solid', fgColor: hintergrund };
  }

  if (s.bd) {
    const border: Partial<Style['border']> = {};
    for (const [key, seite] of [['t', 'top'], ['r', 'right'], ['b', 'bottom'], ['l', 'left']] as const) {
      const rand = s.bd[key];
      const style = rand ? RAHMEN[rand.s] : undefined;
      if (style) {
        border[seite] = { style, color: rgbZuArgb(rand!.cl?.rgb) ?? { argb: 'FF000000' } };
      }
    }
    if (Object.keys(border).length) { ziel.border = border; }
  }

  const alignment: Partial<Style['alignment']> = {};
  if (s.ht && HORIZONTAL[s.ht]) { alignment.horizontal = HORIZONTAL[s.ht]; }
  if (s.vt && VERTIKAL[s.vt]) { alignment.vertical = VERTIKAL[s.vt]; }
  if (s.tb === WRAP) { alignment.wrapText = true; }
  if (s.tr?.a) { alignment.textRotation = s.tr.a; }
  if (Object.keys(alignment).length) { ziel.alignment = alignment; }
}
