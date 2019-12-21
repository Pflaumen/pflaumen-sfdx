// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// start outputChannel for WMP SFDX to post to
	let outputChannel = vscode.window.createOutputChannel(`WMP SFDX`);
	// create a terminal for us to use
	vscode.commands.executeCommand('extension.createTerminal');

	// openWorkbench
	vscode.commands.registerCommand('extension.openWorkbench', () => {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'Running Open Workbench...');
		const util = require('util');
		const exec = util.promisify(require('child_process').exec);
		// TODO: Add progress indicator?
		// TODO: Dynamic username
		// TODO: add choice of saved orgs
		async function reallyOpenWorkbench(orgAlias : String) {
			try {
				let command = 'sfdx dmg:workbench:open -u '+ orgAlias;
				const { stdout, stderr } = await exec(command);
				vscode.commands.executeCommand('extension.appendToOutputChannel', stdout);
				console.log('stdout: '+stdout);
				console.log('stderr: '+stderr);

			} catch (err) {
				vscode.commands.executeCommand('extension.appendToOutputChannel', err);
				vscode.window.showErrorMessage('' + err);
				console.error(err);
			}
		}

		async function openWorkbench() {
			try {
				// const { stdout, stderr } = await exec('sfdx dmg:workbench:open -u resourceful-bear');
				// const { stdout, stderr } = await exec('sfdx dmg:workbench:open');
				const { stdout, stderr } = await exec('sfdx force:org:list --json');
				vscode.commands.executeCommand('extension.appendToOutputChannel', stdout);
				const output = JSON.parse(stdout);
				const nonScratchOrgList = output.result.nonScratchOrgs;
				const scratchOrgList = output.result.scratchOrgs;
				selectOrg(nonScratchOrgList).then(orgAlias => {
					console.log('orgAlias selected: ' + orgAlias);
					if(orgAlias) {
						reallyOpenWorkbench(orgAlias);
					}

				});
				console.log('nonScratchOrgList: ' + JSON.stringify(nonScratchOrgList));
				console.log('scratchOrgList: ' + JSON.stringify(scratchOrgList));

			} catch (err) {
				vscode.commands.executeCommand('extension.appendToOutputChannel', err);
				vscode.window.showErrorMessage('' + err);
				console.error(err);
			}
		}
		
		vscode.window.setStatusBarMessage('WMP SFDX: Opening Workbench...', openWorkbench());
	});

	function selectOrg(nonScratchOrgList): Thenable<String | undefined> {
		interface OrgQuickPickItem extends vscode.QuickPickItem {
			alias: String;
		}
		const items: OrgQuickPickItem[] = nonScratchOrgList.map(org => {
			return {
				label: org.alias ? org.alias + ' - ' + org.username : org.username,
				alias: org.alias
			};
		});
		return vscode.window.showQuickPick(items, ).then(item => {
			return item ? item.alias : undefined;
		});
	}

	// retrieveSource
	vscode.commands.registerCommand('extension.retrieveSource', () => {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'Retrieving Source...');
		let command = vscode.commands.executeCommand('extension.runCommand', 'sfdx dmg:source:retrieve -x ./manifest/package.xml');
		vscode.window.setStatusBarMessage('WMP SFDX: Retrieving Source...', command);
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'Done retrieving source...');
	});

	// cleanup
	vscode.commands.registerCommand('extension.cleanup', () => {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'Cleaning up...');
		let command = vscode.commands.executeCommand('extension.runCommand', 'sfdx dmg:source:cleanup');
		vscode.window.setStatusBarMessage('WMP SFDX: Cleaning up...', command);
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'Done cleaning up...');
	});

	// appendToOutputChannel
	context.subscriptions.push(vscode.commands.registerCommand('extension.appendToOutputChannel', (message) => {
		outputChannel.appendLine(new Date().toLocaleTimeString() + ' ' + message);
		outputChannel.show(true);
	}));

	// runCommand
	context.subscriptions.push(vscode.commands.registerCommand('extension.runCommand', (command) => {
		let terminal = (<any>vscode.window).terminals[0];
		//TODO: loop through and find the "correct" terminal?
		terminal.sendText(command);
	}));

	// createTerminal
	context.subscriptions.push(vscode.commands.registerCommand('extension.createTerminal', () => {
		vscode.window.createTerminal('wmp-sfdx');
	}));




	// // vscode.window.onDidOpenTerminal
	// vscode.window.onDidOpenTerminal(terminal => {
	// 	console.log("Terminal opened. Total count: " + (<any>vscode.window).terminals.length);
	// });
	// vscode.window.onDidOpenTerminal((terminal: vscode.Terminal) => {
	// 	vscode.window.showInformationMessage(`onDidOpenTerminal, name: ${terminal.name}`);
	// });

	// // vscode.window.onDidChangeActiveTerminal
	// vscode.window.onDidChangeActiveTerminal(e => {
	// 	console.log(`Active terminal changed, name=${e ? e.name : 'undefined'}`);
	// });

	// // Terminal.show
	// context.subscriptions.push(vscode.commands.registerCommand('extension.showTerminal', () => {
	// 	if (ensureTerminalExists()) {
	// 		// pass in the correct terminal id
	// 		let terminal = (<any>vscode.window).terminals[0];
	// 		terminal.show();
	// 		// selectTerminal().then(terminal => {
	// 		// 	if (terminal) {
	// 		// 		terminal.show();
	// 		// 	}
	// 		// });
	// 	}
	// }));

	// // Terminal.sendText
	// context.subscriptions.push(vscode.commands.registerCommand('extension.sendText', () => {
	// 	if (ensureTerminalExists()) {
	// 		selectTerminal().then(terminal => {
	// 			if (terminal) {
	// 				terminal.sendText("echo 'Hello world!'");
	// 			}
	// 		});
	// 	}
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.sendTextNoNewLine', () => {
	// 	if (ensureTerminalExists()) {
	// 		selectTerminal().then(terminal => {
	// 			if (terminal) {
	// 				terminal.sendText("echo 'Hello world!'", false);
	// 			}
	// 		});
	// 	}
	// }));

	// // Terminal.dispose
	// context.subscriptions.push(vscode.commands.registerCommand('extension.dispose', () => {
	// 	if (ensureTerminalExists()) {
	// 		selectTerminal().then(terminal => {
	// 			if (terminal) {
	// 				terminal.dispose();
	// 			}
	// 		});
	// 	}
	// }));

	// // Terminal.processId
	// context.subscriptions.push(vscode.commands.registerCommand('extension.processId', () => {
	// 	selectTerminal().then(terminal => {
	// 		if (!terminal) {
	// 			return;
	// 		}
	// 		terminal.processId.then((processId) => {
	// 			if (processId) {
	// 				vscode.window.showInformationMessage(`Terminal.processId: ${processId}`);
	// 			} else {
	// 				vscode.window.showInformationMessage('Terminal does not have a process ID');
	// 			}
	// 		});
	// 	});
	// }));

	// // vscode.window.onDidCloseTerminal
	// vscode.window.onDidCloseTerminal((terminal) => {
	// 	vscode.window.showInformationMessage(`onDidCloseTerminal, name: ${terminal.name}`);
	// });

	// // vscode.window.terminals
	// context.subscriptions.push(vscode.commands.registerCommand('extension.terminals', () => {
	// 	selectTerminal();
	// }));

	// // vvv Proposed APIs below vvv

	// // vscode.window.onDidWriteTerminalData
	// context.subscriptions.push(vscode.commands.registerCommand('extension.onDidWriteTerminalData', () => {
	// 	(<any>vscode.window).onDidWriteTerminalData((e: any) => {
	// 		vscode.window.showInformationMessage(`onDidWriteTerminalData listener attached, check the devtools console to see events`);
	// 		console.log('onDidWriteData', e);
	// 	});
	// }));

	// // vscode.window.onDidChangeTerminalDimensions
	// context.subscriptions.push(vscode.commands.registerCommand('extension.onDidChangeTerminalDimensions', () => {
	// 	vscode.window.showInformationMessage(`Listening to onDidChangeTerminalDimensions, check the devtools console to see events`);
	// 	(<any>vscode.window).onDidChangeTerminalDimensions((event: any) => {
	// 		console.log(`onDidChangeTerminalDimensions: terminal:${event.terminal.name}, columns=${event.dimensions.columns}, rows=${event.dimensions.rows}`);
	// 	});
	// }));
}

// function colorText(text: string): string {
// 	let output = '';
// 	let colorIndex = 1;
// 	for (let i = 0; i < text.length; i++) {
// 		const char = text.charAt(i);
// 		if (char === ' ' || char === '\r' || char === '\n') {
// 			output += char;
// 		} else {
// 			output += `\x1b[3${colorIndex++}m${text.charAt(i)}\x1b[0m`;
// 			if (colorIndex > 6) {
// 				colorIndex = 1;
// 			}
// 		}
// 	}
// 	return output;
// }

function selectTerminal(): Thenable<vscode.Terminal | undefined> {
	interface TerminalQuickPickItem extends vscode.QuickPickItem {
		terminal: vscode.Terminal;
	}
	const terminals = <vscode.Terminal[]>(<any>vscode.window).terminals;
	const items: TerminalQuickPickItem[] = terminals.map(t => {
		return {
			label: `name: ${t.name}`,
			terminal: t
		};
	});
	return vscode.window.showQuickPick(items).then(item => {
		return item ? item.terminal : undefined;
	});
}

function ensureTerminalExists(): boolean {
	if ((<any>vscode.window).terminals.length === 0) {
		vscode.window.showErrorMessage('No active terminals');
		return false;
	}
	return true;
}
// this method is called when your extension is deactivated
export function deactivate() { }
