// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { PdfEditorProvider } from './pdfEditor';
import { SheetEditorProvider, neueTabelle } from './sheetEditor';
import { UmlEditorProvider, neuesDiagramm } from './umlEditor';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vs-office" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('vs-office.helloOffice', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('HelloWorld from vs-office!');
	});

	const timeMessage = vscode.commands.registerCommand('vs-office.time', () => {
		const now: Date = new Date();
		
		vscode.window.showWarningMessage(`${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`);
	});

	context.subscriptions.push(PdfEditorProvider.register(context));
	context.subscriptions.push(SheetEditorProvider.register(context));
	context.subscriptions.push(vscode.commands.registerCommand('vs-office.neueTabelle', neueTabelle));
	context.subscriptions.push(UmlEditorProvider.register(context));
	context.subscriptions.push(vscode.commands.registerCommand('vs-office.neuesDiagramm', neuesDiagramm));

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
