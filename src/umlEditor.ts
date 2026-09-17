import * as vscode from 'vscode';

/** Diagrammtypen, die die Webview kennt (siehe src/webview/uml/modell.ts) */
const DIAGRAMM_TYPEN = [
  { typ: 'klasse', name: 'Klassendiagramm', beschreibung: 'Klassen, Attribute, Methoden, Vererbung, Assoziationen' },
  { typ: 'aktivitaet', name: 'Aktivitätsdiagramm / Programmablaufplan', beschreibung: 'Start, Aktionen, Entscheidungen, Ein-/Ausgabe, Ende' },
  { typ: 'anwendungsfall', name: 'Anwendungsfalldiagramm', beschreibung: 'Akteure, Anwendungsfälle, System, include/extend' },
  { typ: 'zustand', name: 'Zustandsdiagramm', beschreibung: 'Zustände und Übergänge' },
  { typ: 'sequenz', name: 'Sequenzdiagramm', beschreibung: 'Objekte, Lebenslinien, Nachrichten' },
  { typ: 'frei', name: 'Freies Diagramm', beschreibung: 'Kästen, Text, Notizen, Pfeile' },
];

function leeresDiagramm(typ: string, titel: string): string {
  const richtung = typ === 'anwendungsfall' || typ === 'sequenz' ? 'links' : 'oben';
  return JSON.stringify({ version: 1, typ, titel, raster: true, linie: 'gerade', richtung, knoten: [], kanten: [] }, null, 2) + '\n';
}

/** Ein geöffnetes Diagramm. Hält den Stand, mit dem der Editor gestartet ist. */
class UmlDocument implements vscode.CustomDocument {
  constructor(readonly uri: vscode.Uri, readonly initialData: unknown) {}
  dispose() {}
}

async function diagrammLesen(uri: vscode.Uri): Promise<unknown> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const text = new TextDecoder().decode(bytes).trim();
  if (!text) {
    // Eine im Explorer neu angelegte, leere .uml -> leeres Klassendiagramm
    return JSON.parse(leeresDiagramm('klasse', ''));
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${uri.path.split('/').pop()} ist kein gültiges Diagramm (JSON erwartet): ${(e as Error).message}`);
  }
}

/**
 * Custom Editor für *.uml (JSON). Die Webview (media/uml/uml.js) zeichnet und bearbeitet das Diagramm;
 * die Extension liest und schreibt die Datei und übernimmt Export-Dialoge.
 */
export class UmlEditorProvider implements vscode.CustomEditorProvider<UmlDocument> {
  static readonly viewType = 'office.umlEditor';

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      UmlEditorProvider.viewType,
      new UmlEditorProvider(context),
      // Editor-Zustand (Undo-Verlauf, Zoom) beim Tab-Wechsel behalten
      { webviewOptions: { retainContextWhenHidden: true } }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  private readonly _onDidChange = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<UmlDocument>>();
  readonly onDidChangeCustomDocument = this._onDidChange.event;

  private readonly webviews = new Map<string, vscode.Webview>();
  private readonly waiting = new Map<number, { resolve: (data: unknown) => void; reject: (e: Error) => void }>();
  private nextRequestId = 1;
  /** Kopierte Formen, damit Kopieren/Einfügen zwischen Diagrammen funktioniert */
  private zwischenablage: unknown = null;

  async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext) {
    const quelle = openContext.backupId ? vscode.Uri.parse(openContext.backupId) : uri;
    return new UmlDocument(uri, await diagrammLesen(quelle));
  }

  async resolveCustomEditor(document: UmlDocument, panel: vscode.WebviewPanel) {
    const media = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'uml');
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    panel.webview.html = this.getHtml(panel.webview, media);

    const key = document.uri.toString();
    this.webviews.set(key, panel.webview);
    panel.onDidDispose(() => this.webviews.delete(key));

    panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'ready':
          panel.webview.postMessage({ type: 'load', data: document.initialData });
          if (this.zwischenablage) {
            panel.webview.postMessage({ type: 'zwischenablage', daten: this.zwischenablage });
          }
          break;
        case 'dirty':
          this._onDidChange.fire({ document });
          break;
        case 'umlData':
          this.waiting.get(msg.requestId)?.resolve(msg.data);
          this.waiting.delete(msg.requestId);
          break;
        case 'zwischenablage':
          this.zwischenablage = msg.daten;
          for (const [andere, webview] of this.webviews) {
            if (andere !== key) {
              webview.postMessage({ type: 'zwischenablage', daten: msg.daten });
            }
          }
          break;
        case 'export':
          await this.exportieren(document, panel.webview, msg.format, msg.inhalt);
          break;
        case 'error':
          vscode.window.showErrorMessage(`UML-Editor: ${msg.text}`);
          break;
      }
    });
  }

  private async exportieren(document: UmlDocument, webview: vscode.Webview, format: 'svg' | 'png', inhalt: string): Promise<void> {
    const basis = document.uri.path.replace(/\.uml$/i, '');
    const ziel = await vscode.window.showSaveDialog({
      title: `Diagramm als ${format.toUpperCase()} exportieren`,
      defaultUri: document.uri.with({ path: `${basis}.${format}` }),
      filters: format === 'svg' ? { 'SVG-Grafik': ['svg'] } : { 'PNG-Bild': ['png'] },
    });
    if (!ziel) {
      return;
    }
    const bytes = format === 'svg' ? new TextEncoder().encode(inhalt) : new Uint8Array(Buffer.from(inhalt, 'base64'));
    await vscode.workspace.fs.writeFile(ziel, bytes);
    webview.postMessage({ type: 'info', text: `Exportiert nach ${ziel.path.split('/').pop()}` });
  }

  private getHtml(webview: vscode.Webview, media: vscode.Uri): string {
    const uri = (datei: string) => webview.asWebviewUri(vscode.Uri.joinPath(media, datei));
    const nonce = crypto.randomUUID().replace(/-/g, '');
    // Das Diagramm wird mit style-Attributen gezeichnet (nötig für den SVG-Export), daher 'unsafe-inline' für Styles
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} blob: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${uri('uml.css')}">
</head>
<body>
  <script type="module" nonce="${nonce}" src="${uri('uml.js')}"></script>
</body>
</html>`;
  }

  // Fragt die Webview nach dem aktuellen Stand des Diagramms
  private getDataFromWebview(document: UmlDocument): Promise<unknown> {
    const webview = this.webviews.get(document.uri.toString());
    if (!webview) {
      return Promise.reject(new Error('Für dieses Diagramm ist kein Editor offen.'));
    }
    const requestId = this.nextRequestId++;
    const antwort = new Promise<unknown>((resolve, reject) => this.waiting.set(requestId, { resolve, reject }));
    webview.postMessage({ type: 'getData', requestId });
    return antwort;
  }

  async saveCustomDocument(document: UmlDocument) {
    await this.saveCustomDocumentAs(document, document.uri);
  }

  async saveCustomDocumentAs(document: UmlDocument, ziel: vscode.Uri) {
    const daten = await this.getDataFromWebview(document);
    await vscode.workspace.fs.writeFile(ziel, new TextEncoder().encode(JSON.stringify(daten, null, 2) + '\n'));
  }

  async revertCustomDocument(document: UmlDocument) {
    const daten = await diagrammLesen(document.uri);
    this.webviews.get(document.uri.toString())?.postMessage({ type: 'load', data: daten });
  }

  async backupCustomDocument(document: UmlDocument, context: vscode.CustomDocumentBackupContext) {
    await this.saveCustomDocumentAs(document, context.destination);
    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination).then(undefined, () => {}),
    };
  }
}

/** Befehl "Neues UML-Diagramm": Typ wählen, leere .uml im Projekt anlegen und im Editor öffnen */
export async function neuesDiagramm(): Promise<void> {
  const wahl = await vscode.window.showQuickPick(
    DIAGRAMM_TYPEN.map(t => ({ label: t.name, description: t.beschreibung, typ: t.typ })),
    { title: 'Neues UML-Diagramm', placeHolder: 'Welche Art von Diagramm?' }
  );
  if (!wahl) {
    return;
  }
  const projekt = vscode.workspace.workspaceFolders?.[0]?.uri;
  const ziel = await vscode.window.showSaveDialog({
    title: 'Neues Diagramm anlegen',
    defaultUri: projekt ? vscode.Uri.joinPath(projekt, 'Diagramm.uml') : undefined,
    filters: { 'UML-Diagramm': ['uml'] },
  });
  if (!ziel) {
    return;
  }
  const titel = (ziel.path.split('/').pop() ?? 'Diagramm').replace(/\.uml$/i, '');
  await vscode.workspace.fs.writeFile(ziel, new TextEncoder().encode(leeresDiagramm(wahl.typ, titel)));
  await vscode.commands.executeCommand('vscode.openWith', ziel, UmlEditorProvider.viewType);
}
