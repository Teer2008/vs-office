import * as vscode from 'vscode';
import type { IWorkbookData } from '@univerjs/presets';
import { leereMappe, univerZuXlsx, xlsxZuUniver } from './sheet/konvertierung';

/** Eine geöffnete Tabelle. Hält das Univer-Datenmodell, mit dem der Editor gestartet ist. */
class SheetDocument implements vscode.CustomDocument {
  constructor(readonly uri: vscode.Uri, readonly initialData: IWorkbookData) {}
  dispose() {}
}

async function mappeLesen(uri: vscode.Uri, name: string): Promise<IWorkbookData> {
  const bytes = new Uint8Array(await vscode.workspace.fs.readFile(uri));
  // Eine im Explorer neu angelegte, leere .xlsx ist keine gültige Mappe -> mit einer leeren starten
  return bytes.byteLength === 0 ? leereMappe(name) : xlsxZuUniver(bytes, name);
}

/**
 * Custom Editor für *.xlsx.
 * Die Extension (dieser Code) liest und schreibt die Datei und übersetzt sie mit ExcelJS
 * in das Datenmodell von Univer; die Webview (media/sheet/sheet.js) zeigt die Tabelle mit Univer an.
 */
export class SheetEditorProvider implements vscode.CustomEditorProvider<SheetDocument> {
  static readonly viewType = 'office.sheetEditor';

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      SheetEditorProvider.viewType,
      new SheetEditorProvider(context),
      // Univer beim Tab-Wechsel nicht zerstören, sonst sind ungespeicherte Änderungen weg
      { webviewOptions: { retainContextWhenHidden: true } }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  private readonly _onDidChange = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<SheetDocument>>();
  readonly onDidChangeCustomDocument = this._onDidChange.event;

  private readonly webviews = new Map<string, vscode.Webview>();
  private readonly waiting = new Map<number, { resolve: (data: IWorkbookData) => void; reject: (e: Error) => void }>();
  private nextRequestId = 1;

  async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext) {
    const quelle = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : uri;
    return new SheetDocument(uri, await mappeLesen(quelle, uri.path.split('/').pop() ?? 'Tabelle'));
  }

  async resolveCustomEditor(document: SheetDocument, panel: vscode.WebviewPanel) {
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'sheet');
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    panel.webview.html = this.getHtml(panel.webview, media);

    const key = document.uri.toString();
    this.webviews.set(key, panel.webview);
    panel.onDidDispose(() => this.webviews.delete(key));

    panel.webview.onDidReceiveMessage(msg => {
      switch (msg.type) {
        case 'ready':
          panel.webview.postMessage({ type: 'load', data: document.initialData });
          break;
        case 'dirty':
          this._onDidChange.fire({ document });
          break;
        case 'sheetData':
          this.waiting.get(msg.requestId)?.resolve(msg.data);
          this.waiting.delete(msg.requestId);
          break;
        case 'error':
          vscode.window.showErrorMessage(`Tabellen-Editor: ${msg.text}`);
          break;
      }
    });
  }

  private getHtml(webview: vscode.Webview, media: vscode.Uri): string {
    const uri = (datei: string) => webview.asWebviewUri(vscode.Uri.joinPath(media, datei));
    const nonce = crypto.randomUUID().replace(/-/g, '');

    // Univer setzt Styles inline und lädt Symbole/Schriften als data:-URLs
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} blob: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `script-src 'nonce-${nonce}'`,
      `worker-src ${webview.cspSource} blob:`,
      `connect-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${uri('sheet.css')}">
  <style>
    html, body, #app { height: 100%; margin: 0; padding: 0; overflow: hidden; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${uri('sheet.js')}"></script>
</body>
</html>`;
  }

  // Fragt die Webview nach dem aktuellen Zustand der Mappe
  private getDataFromWebview(document: SheetDocument): Promise<IWorkbookData> {
    const webview = this.webviews.get(document.uri.toString());
    if (!webview) {
      return Promise.reject(new Error('Für diese Tabelle ist kein Editor offen.'));
    }
    const requestId = this.nextRequestId++;
    const antwort = new Promise<IWorkbookData>((resolve, reject) => this.waiting.set(requestId, { resolve, reject }));
    webview.postMessage({ type: 'getData', requestId });
    return antwort;
  }

  async saveCustomDocument(document: SheetDocument) {
    await this.saveCustomDocumentAs(document, document.uri);
  }

  async saveCustomDocumentAs(document: SheetDocument, ziel: vscode.Uri) {
    const daten = await this.getDataFromWebview(document);
    await vscode.workspace.fs.writeFile(ziel, await univerZuXlsx(daten));
  }

  async revertCustomDocument(document: SheetDocument) {
    const daten = await mappeLesen(document.uri, document.initialData.name);
    this.webviews.get(document.uri.toString())?.postMessage({ type: 'load', data: daten });
  }

  async backupCustomDocument(document: SheetDocument, context: vscode.CustomDocumentBackupContext) {
    await this.saveCustomDocumentAs(document, context.destination);
    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination).then(undefined, () => {}),
    };
  }
}

/** Befehl "Neue Tabelle": leere .xlsx im Projekt anlegen und im Editor öffnen */
export async function neueTabelle(): Promise<void> {
  const projekt = vscode.workspace.workspaceFolders?.[0]?.uri;
  const ziel = await vscode.window.showSaveDialog({
    title: 'Neue Tabelle anlegen',
    defaultUri: projekt ? vscode.Uri.joinPath(projekt, 'Tabelle.xlsx') : undefined,
    filters: { 'Excel-Tabelle': ['xlsx'] },
  });
  if (!ziel) {
    return;
  }
  await vscode.workspace.fs.writeFile(ziel, await univerZuXlsx(leereMappe(ziel.path.split('/').pop() ?? 'Tabelle.xlsx')));
  await vscode.commands.executeCommand('vscode.openWith', ziel, SheetEditorProvider.viewType);
}
