// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	let globalState = context.globalState;

	const util = require('util');
	const exec = util.promisify(require('child_process').exec);

	// start outputChannel for WMP SFDX to post to
	let outputChannel = vscode.window.createOutputChannel('WMP SFDX');
	const fsPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;

	if(!globalState.get('nonScratchOrgList')) {
		vscode.window.setStatusBarMessage('WMP SFDX: Refreshing Org List...', getOrgList(false));
	}

	async function openWorkbench(orgAlias : String) {
		try {
			let command = 'sfdx dmg:workbench:open -u '+ orgAlias;
			const { stdout, stderr } = await exec(command);
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: ' + stdout);
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: ' + err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	async function getOrgList(showOrgSelect : boolean) {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: Refreshing Org List...');
		try {
			const { stdout, stderr } = await exec('sfdx force:org:list --json');
			const output = JSON.parse(stdout);
			const nonScratchOrgList = output.result.nonScratchOrgs;
			globalState.update('nonScratchOrgList',nonScratchOrgList);
			const scratchOrgList = output.result.scratchOrgs;
			globalState.update('scratchOrgList',scratchOrgList);
			if(showOrgSelect) {
				selectOrg(nonScratchOrgList).then(orgAlias => {
					if(orgAlias) {
						vscode.window.setStatusBarMessage('WMP SFDX: Opening Workbench...', openWorkbench(orgAlias));
					}
				});
			}
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: Refreshing Org List Finished');
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	function selectOrg(nonScratchOrgList): Thenable<String | undefined> {
		interface OrgQuickPickItem extends vscode.QuickPickItem {
			alias: String;
		}
		let items: OrgQuickPickItem[] = nonScratchOrgList.map(org => {
			return {
				label: org.alias ? org.alias + ' - ' + org.username : org.username,
				alias: org.alias
			};
		});
		items.push(
			{
				label: 'Refresh Org List',
				alias: 'refresh'
			}
		);
		return vscode.window.showQuickPick(items).then(item => {
			if(item?.alias === 'refresh') {
				vscode.window.setStatusBarMessage('WMP SFDX: Refreshing Org List...', getOrgList(true));
			} else {
				return item ? item.alias : undefined;
			}
		});
	}

	async function retrieveSource() {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: Retrieving Source...');
		try {
			let command = 'sfdx dmg:source:retrieve -x ./manifest/package.xml';
			const { stdout, stderr } = await exec(command,{cwd:fsPath});
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: ' + stdout);
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: Retrieving Source Finished');
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: ' + err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	async function cleanup() {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: Cleaning Up...');
		try {
			let command = 'sfdx dmg:source:cleanup';
			const { stdout, stderr } = await exec(command,{cwd:fsPath});
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: ' + stdout);
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: Cleaning Up Finished');
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: ' + err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	// openWorkbench
	vscode.commands.registerCommand('extension.openWorkbench', () => {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'WMP SFDX: Checking Org List...');
		// TODO: Add progress indicator?
		if(globalState.get('nonScratchOrgList')) {
			selectOrg(globalState.get('nonScratchOrgList')).then(orgAlias => {
				if(orgAlias) {
					vscode.window.setStatusBarMessage('WMP SFDX: Opening Workbench...', openWorkbench(orgAlias));
				}

			});
		} else {
			vscode.window.setStatusBarMessage('WMP SFDX: Refreshing Org List...', getOrgList(true));
		}
	});

	// retrieveSource
	vscode.commands.registerCommand('extension.retrieveSource', () => {
		vscode.window.setStatusBarMessage('WMP SFDX: Retrieving Source...', retrieveSource());
	});

	// cleanup
	vscode.commands.registerCommand('extension.cleanup', () => {
		vscode.window.setStatusBarMessage('WMP SFDX: Cleaning Up...', cleanup());
	});

	// appendToOutputChannel
	context.subscriptions.push(vscode.commands.registerCommand('extension.appendToOutputChannel', (message) => {
		outputChannel.appendLine(new Date().toLocaleTimeString() + ' ' + message);
		outputChannel.show(true);
	}));
}
// function selectTerminal(): Thenable<vscode.Terminal | undefined> {
// 	interface TerminalQuickPickItem extends vscode.QuickPickItem {
// 		terminal: vscode.Terminal;
// 	}
// 	const terminals = <vscode.Terminal[]>(<any>vscode.window).terminals;
// 	const items: TerminalQuickPickItem[] = terminals.map(t => {
// 		return {
// 			label: `name: ${t.name}`,
// 			terminal: t
// 		};
// 	});
// 	return vscode.window.showQuickPick(items).then(item => {
// 		return item ? item.terminal : undefined;
// 	});
// }

// function ensureTerminalExists(): boolean {
// 	if ((<any>vscode.window).terminals.length === 0) {
// 		vscode.window.showErrorMessage('No active terminals');
// 		return false;
// 	}
// 	return true;
// }
// this method is called when your extension is deactivated
export function deactivate() { }
