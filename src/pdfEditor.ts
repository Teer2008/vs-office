import * as vscode from 'vscode';

/**
 * Liest eine Datei als echtes Uint8Array.
 * workspace.fs.readFile() gibt im Extension-Host einen Node-Buffer zurück.
 * Den kennt die Serialisierung von webview.postMessage nicht: sie prüft
 * constructor.name gegen die Standard-TypedArray-Typen, findet "Buffer" nicht
 * und JSON-serialisiert stattdessen - in der Webview käme dann
 * { type: "Buffer", data: [...] } statt der Bytes an.
 */
async function datenLesen(uri: vscode.Uri): Promise<Uint8Array> {
  return new Uint8Array(await vscode.workspace.fs.readFile(uri));
}

/** Ein geöffnetes PDF. Hält nur die Bytes, mit denen der Editor gestartet ist. */
class PdfDocument implements vscode.CustomDocument {
  constructor(readonly uri: vscode.Uri, readonly initialData: Uint8Array) {}
  dispose() {}
}

/**
 * Custom Editor für *.pdf.
 * Die Extension (dieser Code) liest und schreibt Dateien,
 * die Webview (media/main.js) zeigt das PDF mit PDF.js an und erzeugt die Anmerkungen.
 */
export class PdfEditorProvider implements vscode.CustomEditorProvider<PdfDocument> {
  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      'office.pdfEditor',
      new PdfEditorProvider(context),
      // Webview beim Tab-Wechsel nicht zerstören, sonst sind ungespeicherte Anmerkungen weg
      { webviewOptions: { retainContextWhenHidden: true } }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  // Feuern wir dieses Event, zeigt VS Code den Tab als "ungespeichert" (●) an
  private readonly _onDidChange = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<PdfDocument>>();
  readonly onDidChangeCustomDocument = this._onDidChange.event;

  private readonly webviews = new Map<string, vscode.Webview>();
  private readonly waiting = new Map<number, (data: Uint8Array) => void>();
  private nextRequestId = 1;

  // 1. VS Code öffnet eine PDF-Datei
  async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext) {
    // Nach einem Absturz gibt es evtl. eine Sicherungskopie mit ungespeicherten Änderungen
    const quelle = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : uri;
    return new PdfDocument(uri, await datenLesen(quelle));
  }

  // 2. VS Code braucht die Oberfläche dazu
  async resolveCustomEditor(document: PdfDocument, panel: vscode.WebviewPanel) {
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    panel.webview.html = this.getHtml(panel.webview, media);

    const key = document.uri.toString();
    this.webviews.set(key, panel.webview);
    panel.onDidDispose(() => this.webviews.delete(key));

    panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'ready':   // Webview ist geladen -> PDF-Bytes schicken
          panel.webview.postMessage({ type: 'load', data: document.initialData });
          break;
        case 'dirty':   // Nutzer hat etwas annotiert
          this._onDidChange.fire({ document });
          break;
        case 'pdfData': // Antwort auf getData (siehe getDataFromWebview)
          this.waiting.get(msg.requestId)?.(new Uint8Array(msg.data));
          this.waiting.delete(msg.requestId);
          break;
        case 'error':   // Die Webview kommt nicht weiter -> Nutzer informieren
          vscode.window.showErrorMessage(`PDF-Editor: ${msg.text}`);
          break;
        case 'bildWaehlen': {   // Bild-Werkzeug: Datei über den Dialog von VS Code holen
          const auswahl = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Einfügen',
            title: 'Bild in das PDF einfügen',
            // Muss zu BILD_MIME in media/main.js passen - mehr Formate kann PDF.js nicht einbetten.
            filters: { Bilder: ['png', 'apng', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico'] },
          });
          const datei = auswahl?.[0];
          if (datei) {
            panel.webview.postMessage({
              type: 'bild',
              data: await datenLesen(datei),
              name: datei.path.split('/').pop(),
            });
          }
          break;
        }
      }
    });
  }

  private getHtml(webview: vscode.Webview, media: vscode.Uri): string {
    const uri = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(media, ...p));
    const nonce = crypto.randomUUID().replace(/-/g, '');

    // Content Security Policy: erlaubt nur unsere eigenen Dateien.
    // worker-src blob: -> main.js baut den PDF.js-Worker selbst als Blob-URL
    // wasm-unsafe-eval -> Decoder für eingescannte PDFs
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} blob: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `script-src 'nonce-${nonce}' ${webview.cspSource} 'wasm-unsafe-eval'`,
      `worker-src ${webview.cspSource} blob:`,
      `connect-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${uri('pdfjs', 'pdf_viewer.css')}">
  <link rel="stylesheet" href="${uri('editor.css')}">
</head>
<body data-pdfjs="${uri('pdfjs')}/">
  <header id="kopf">
    <div id="werkzeuge" role="toolbar" aria-label="Werkzeuge"></div>
    <div id="optionen"><div id="optionenInhalt"></div></div>
  </header>
  <div id="buehne">
    <div id="fehler" hidden></div>
    <div id="viewerContainer"><div id="viewer" class="pdfViewer"></div></div>
  </div>
  <script type="module" nonce="${nonce}" src="${uri('pdfjs', 'pdf.mjs')}"></script>
  <script type="module" nonce="${nonce}" src="${uri('pdfjs', 'pdf_viewer.mjs')}"></script>
  <script type="module" nonce="${nonce}" src="${uri('main.js')}"></script>
</body>
</html>`;
  }

  // Fragt die Webview nach dem aktuellen PDF (mit Anmerkungen) und wartet auf die Antwort
  private getDataFromWebview(document: PdfDocument): Promise<Uint8Array> {
    const webview = this.webviews.get(document.uri.toString());
    if (!webview) {
      return Promise.reject(new Error('Für dieses PDF ist kein Editor offen.'));
    }
    const requestId = this.nextRequestId++;
    const antwort = new Promise<Uint8Array>(resolve => this.waiting.set(requestId, resolve));
    webview.postMessage({ type: 'getData', requestId });
    return antwort;
  }

  // 3. Strg+S
  async saveCustomDocument(document: PdfDocument) {
    await this.saveCustomDocumentAs(document, document.uri);
  }

  // "Speichern unter..."
  async saveCustomDocumentAs(document: PdfDocument, ziel: vscode.Uri) {
    const data = await this.getDataFromWebview(document);
    await vscode.workspace.fs.writeFile(ziel, data);
  }

  // "Datei wiederherstellen": Original von der Platte neu laden
  async revertCustomDocument(document: PdfDocument) {
    const data = await datenLesen(document.uri);
    this.webviews.get(document.uri.toString())?.postMessage({ type: 'load', data });
  }

  // Sicherungskopie, damit bei einem Absturz nichts verloren geht
  async backupCustomDocument(document: PdfDocument, context: vscode.CustomDocumentBackupContext) {
    await this.saveCustomDocumentAs(document, context.destination);
    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination).then(undefined, () => {}),
    };
  }
}
