import * as assert from 'assert';
import { Workbook } from 'exceljs';
import { leereMappe, univerZuXlsx, xlsxZuUniver } from '../sheet/konvertierung';
import type { ICellData } from '@univerjs/presets';

async function beispielXlsx(): Promise<Uint8Array> {
  const mappe = new Workbook();
  const ws = mappe.addWorksheet('Daten', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  ws.getCell('A1').value = 'Posten';
  ws.getCell('A1').font = { bold: true, color: { argb: 'FFFF0000' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  ws.getCell('B1').value = 'Betrag';
  ws.getCell('B2').value = 10;
  ws.getCell('B3').value = 32.5;
  ws.getCell('B4').value = { formula: 'SUM(B2:B3)', result: 42.5 };
  ws.getCell('B4').numFmt = '#,##0.00 €';
  ws.getCell('C2').value = new Date(Date.UTC(2024, 0, 15));
  ws.getCell('D2').value = true;
  ws.getCell('A5').value = 'verbunden';
  ws.mergeCells('A5:B6');
  ws.getColumn(1).width = 30;
  ws.getRow(2).height = 30;
  ws.getRow(3).hidden = true;
  ws.getCell('A2').border = { bottom: { style: 'thin', color: { argb: 'FF0000FF' } } };
  ws.getCell('A2').alignment = { horizontal: 'center', wrapText: true };
  mappe.addWorksheet('Leer');
  return new Uint8Array(await mappe.xlsx.writeBuffer());
}

suite('xlsx <-> Univer', () => {
  test('xlsx nach Univer', async () => {
    const daten = await xlsxZuUniver(await beispielXlsx(), 'test.xlsx');
    assert.deepStrictEqual(daten.sheetOrder, ['blatt-1', 'blatt-2']);
    const blatt = daten.sheets['blatt-1'];
    assert.strictEqual(blatt.name, 'Daten');
    const z = blatt.cellData!;
    assert.deepStrictEqual(z[0][0].v, 'Posten');
    assert.strictEqual(z[0][0].s && typeof z[0][0].s === 'object' ? z[0][0].s.bl : undefined, 1);
    assert.strictEqual((z[0][0].s as any).cl.rgb, '#FF0000');
    assert.strictEqual((z[0][0].s as any).bg.rgb, '#FFFF00');
    assert.strictEqual(z[1][1].v, 10);
    assert.strictEqual(z[3][1].f, '=SUM(B2:B3)');
    assert.strictEqual(z[3][1].v, 42.5);
    assert.strictEqual((z[3][1].s as any).n.pattern, '#,##0.00 €');
    assert.strictEqual(z[1][2].v, 45306);   // 15.01.2024 als Excel-Serial
    assert.deepStrictEqual([z[1][3].v, z[1][3].t], [1, 3]);
    assert.deepStrictEqual(blatt.mergeData, [{ startRow: 4, startColumn: 0, endRow: 5, endColumn: 1 }]);
    assert.strictEqual(blatt.columnData![0].w, 215);
    assert.strictEqual(blatt.rowData![1].h, 40);
    assert.strictEqual(blatt.rowData![2].hd, 1);
    assert.deepStrictEqual((z[1][0].s as any).bd.b, { s: 1, cl: { rgb: '#0000FF' } });
    assert.strictEqual((z[1][0].s as any).ht, 2);
    assert.strictEqual((z[1][0].s as any).tb, 3);
    assert.deepStrictEqual(blatt.freeze, { xSplit: 1, ySplit: 1, startRow: 1, startColumn: 1 });
  });

  test('Round-Trip erhält Inhalt und Formatierung', async () => {
    const original = await xlsxZuUniver(await beispielXlsx(), 'test.xlsx');
    const einmal = await xlsxZuUniver(await univerZuXlsx(original), 'test.xlsx');
    const zweimal = await xlsxZuUniver(await univerZuXlsx(einmal), 'test.xlsx');
    // Beim ersten Durchlauf ergänzt ExcelJS Standardschrift bei formatierten Zellen, danach ist es stabil
    assert.deepStrictEqual(zweimal.sheets, einmal.sheets);
    // Inhalte müssen aber schon nach dem ersten Durchlauf identisch sein
    const nurWerte = (d: typeof original) => Object.values(d.sheets).map(b =>
      Object.entries(b.cellData!).map(([r, z]) => [r, Object.entries(z as Record<string, ICellData>).map(([c, x]) => [c, x.v, x.f])]));
    assert.deepStrictEqual(nurWerte(einmal), nurWerte(original));
    assert.deepStrictEqual(einmal.sheets['blatt-1'].mergeData, original.sheets['blatt-1'].mergeData);
    assert.deepStrictEqual(einmal.sheets['blatt-1'].freeze, original.sheets['blatt-1'].freeze);
  });

  test('Formeln landen als Formel in der xlsx', async () => {
    const univer = leereMappe('neu.xlsx');
    univer.sheets['blatt-1'].cellData = {
      0: { 0: { v: 2, t: 2 }, 1: { f: '=A1*3', v: 6, t: 2 } },
      1: { 0: { v: 'Text', t: 1, s: { bl: 1 } } },
    };
    const mappe = new Workbook();
    await mappe.xlsx.load((await univerZuXlsx(univer)).buffer as ArrayBuffer);
    const ws = mappe.getWorksheet('Tabelle1')!;
    assert.strictEqual(ws.getCell('B1').formula, 'A1*3');
    assert.strictEqual(ws.getCell('B1').result, 6);
    assert.strictEqual(ws.getCell('A2').font.bold, true);
  });

  test('leere Mappe ergibt gültige xlsx', async () => {
    const daten = await xlsxZuUniver(await univerZuXlsx(leereMappe('x.xlsx')), 'x.xlsx');
    assert.strictEqual(daten.sheets['blatt-1'].name, 'Tabelle1');
  });
});
