// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { globalAgent } from 'http';
import { code } from './lib/getFieldsApex';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	let globalState = context.globalState;

	const util = require('util');
	const exec = util.promisify(require('child_process').exec);

	// start outputChannel for Pflaumen SFDX to post to
	let outputChannel = vscode.window.createOutputChannel('Pflaumen SFDX');
	const fsPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;

	if (!globalState.get('combinedList')) {
		vscode.window.setStatusBarMessage('Pflaumen SFDX: Refreshing Org List...', getOrgList(false));
	}

	async function soqlQueryAll(resFileName: String | undefined) {
		try {
			let editor = vscode.window.activeTextEditor;
			let selection = editor?.selection;
			let text = editor?.document.getText(selection).toUpperCase();
			if(text?.match(/SELECT.*FROM.*/) === null) {
				vscode.window.showInformationMessage('Pflaumen SFDX: Invalid string <'+text+'>');
				return;
			}
			let afterFrom = text?.split('FROM')[1];
			let objName = afterFrom?.split('WHERE')[0].trim();
			let qualifiers = afterFrom?.split('WHERE')[1]?.trim();
			let runTmpApexCmd = 'echo "String sObjectName = \''+objName+'\';'+code+'" | sfdx force:apex:execute -u jstone.ryan@wmp.com.uat | grep --line-buffered "USER_DEBUG" | echo "{$(cut -d "{" -f2-)"';
			let fieldResponse = await callExec(runTmpApexCmd);
			if(fieldResponse.status === 'error') {
				return;
			}
			let sObjectFields = JSON.parse(fieldResponse.message);
			let dynamicSoqlQuery = 'SELECT ';
			for(let key in sObjectFields[objName!]) {
				dynamicSoqlQuery += sObjectFields[objName!][key] + ',';
			}
			dynamicSoqlQuery = dynamicSoqlQuery.slice(0, -1);
			dynamicSoqlQuery += ' FROM '+objName;
			if(qualifiers) {
				dynamicSoqlQuery += ' WHERE '+qualifiers;
			}
			let runSoqlCmd = 'sfdx force:data:soql:query -q "'+dynamicSoqlQuery+'" -r=csv';
			let queryResponse = await callExec(runSoqlCmd);
			if(queryResponse.status === 'error') {
				vscode.window.showInformationMessage('Pflaumen SFDX: Errors during query <'+queryResponse.message+'>');
				return;
			}
			if(resFileName) {
				let writeFileCmd = 'echo "'+queryResponse.message+'" > '+resFileName+'.csv';
				let writeResponse = await callExec(writeFileCmd);
				if(writeResponse.status === 'error') {
					vscode.window.showInformationMessage('Pflaumen SFDX: Errors writing file <'+queryResponse.message+'>');
					return;
				}
			} else {
				vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + queryResponse.message);
			}
			vscode.window.showInformationMessage('Pflaumen SFDX: Done');
		} catch(err) {
			vscode.window.showInformationMessage('Pflaumen SFDX: Error '+err);
		}
	}

	async function callExec(command: String) {
		let { stdout, stderr } = await exec(command, { cwd: fsPath });
		if(stderr) {
			return {
				"status": "error",
				"message": stderr
			};
		}
		return {
			"status": "success",
			"message": stdout
		};
	}

	async function openWorkbench(orgAlias: String) {
		try {
			let targetUrl = vscode.workspace.getConfiguration('pflaumen-sfdx.workbench').get('URL');
			let command = 'sfdx dmg:workbench:open -u ' + orgAlias + ' -t ' + targetUrl;
			const { stdout, stderr } = await exec(command, { cwd: fsPath });
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + stdout);
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	async function getOrgList(showOrgSelect: boolean) {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Refreshing Org List...');
		try {
			const { stdout, stderr } = await exec('sfdx force:org:list --json');
			const output = JSON.parse(stdout);
			if(output) {
				globalState.update('nonScratchOrgList', output.result.nonScratchOrgs);
				globalState.update('scratchOrgList', output.result.scratchOrgs);
				buildOrgList();
				let combinedList: any = globalState.get('combinedList');
				if (showOrgSelect) {
					selectOrg(combinedList).then(orgAlias => {
						if (orgAlias && orgAlias !== 'refresh') {
							vscode.window.setStatusBarMessage('Pflaumen SFDX: Opening Workbench...', openWorkbench(orgAlias));
						}
					});
				}
			}
				vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Refreshing Org List Finished');
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	function selectOrg(combinedList: any): Thenable<String | undefined> {
		interface OrgQuickPickItem extends vscode.QuickPickItem {
			alias: String;
		}
		let items: OrgQuickPickItem[] = combinedList.map((org: { alias: string; username: string; orgType: string; lastUsed: boolean;}) => {
			return {
				label: (org.alias ? org.alias : '') + ((org.alias && org.username) ? ' - ' : '') + (org.username ? org.username : ''),
				alias: org.alias,
				description: (org.lastUsed ? 'Last Used ' : '')
			};
		});
		items.push(
			{
				label: 'Refresh Org List',
				alias: 'refresh'
			}
		);
		return vscode.window.showQuickPick(items).then(item => {
			if(item) {
				let showOrgSelect = true;
				for(let i=0;i<combinedList.length;i++) {
					if(combinedList[i].alias === item.alias  && item.alias !== 'refresh') {
						showOrgSelect = false;
						globalState.update('lastUsedOrg', combinedList[i]);
					}
				}
				buildOrgList();
			}
			return item ? item.alias : undefined;
		});
	}

	function buildOrgList() {
		let combinedList = [];
		if (globalState.get('lastUsedOrg')) {
			const lastUsedOrg: any = globalState.get('lastUsedOrg');
			if(lastUsedOrg.alias !== 'refresh') {
				combinedList.push(
					{
						label : lastUsedOrg.label,
						alias: lastUsedOrg.alias,
						username: lastUsedOrg.username,
						lastUsed: true
					}
				);
			}
		}
		const nonScratchOrgList: any = globalState.get('nonScratchOrgList');
		for (let i = 0; i < nonScratchOrgList.length; i++) {
			nonScratchOrgList[i].orgType = 'non';
			nonScratchOrgList[i].lastUsed = false;
			combinedList.push(nonScratchOrgList[i]);
		}
		// console.log('nonScratchOrgList: ' + JSON.stringify(nonScratchOrgList));
		const scratchOrgList: any = globalState.get('scratchOrgList');
		for (let i = 0; i < scratchOrgList.length; i++) {
			scratchOrgList[i].orgType = 'scratch';
			scratchOrgList[i].lastUsed = false;
			combinedList.push(scratchOrgList[i]);
		}
		// console.log('scratchOrgList: ' + JSON.stringify(scratchOrgList));

		globalState.update('combinedList', combinedList);
	}

	async function retrieveSource() {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Retrieving Source...');
		try {
			let command = 'sfdx dmg:source:retrieve -x ./manifest/package.xml';
			const { stdout, stderr } = await exec(command, { cwd: fsPath });
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + stdout);
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Retrieving Source Finished');
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	async function signOut(orgAlias: String) {
		try {
			let command = 'sfdx force:auth:logout -u ' + orgAlias + ' -p';
			const { stdout, stderr } = await exec(command, { cwd: fsPath });
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + stdout);
			vscode.window.setStatusBarMessage('Pflaumen SFDX: Refreshing Org List...', getOrgList(false));

			// clear the last used org
			if (globalState.get('lastUsedOrg')) {
				globalState.update('lastUsedOrg', null);
			}
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	async function cleanup() {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Cleaning Up...');
		try {
			let command = 'sfdx dmg:source:cleanup';
			const { stdout, stderr } = await exec(command, { cwd: fsPath });
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + stdout);
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Cleaning Up Finished');
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	// soqlQueryAll
	vscode.commands.registerCommand('extension.soqlQueryAll', () => {
		vscode.window.showInputBox({ 
			placeHolder: 'Name of file to push results to (blank to push to Terminal)', 
			prompt: 'File Name' 
		}).then(name => {
			vscode.window.showInformationMessage('Pflaumen SFDX: Running SOQL...');
			vscode.window.setStatusBarMessage('Pflaumen SFDX: Running SOQL...', soqlQueryAll(name));
		});
	});

	// openWorkbench
	vscode.commands.registerCommand('extension.openWorkbench', () => {
		// vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Checking Org List...');
		// TODO: Add progress indicator?
		if (globalState.get('combinedList')) {
			selectOrg(globalState.get('combinedList')).then(orgAlias => {
				if (orgAlias && orgAlias !== 'refresh') {
					vscode.window.setStatusBarMessage('Pflaumen SFDX: Opening Workbench...', openWorkbench(orgAlias));
				} else if(orgAlias === 'refresh') {
					vscode.window.setStatusBarMessage('Pflaumen SFDX: Refreshing Org List...', getOrgList(true));
				}

			});
		} else {
			vscode.window.setStatusBarMessage('Pflaumen SFDX: Refreshing Org List...', getOrgList(true));
		}
	});

	// retrieveSource
	vscode.commands.registerCommand('extension.retrieveSource', () => {
		vscode.window.setStatusBarMessage('Pflaumen SFDX: Retrieving Source...', retrieveSource());
	});

	// signOut
	vscode.commands.registerCommand('extension.signOut', () => {
		// vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Checking Org List...');
		// TODO: Add progress indicator?
		if (globalState.get('combinedList')) {
			selectOrg(globalState.get('combinedList')).then(orgAlias => {
				if (orgAlias && orgAlias !== 'refresh') {
					vscode.window.setStatusBarMessage('Pflaumen SFDX: Signing out...', signOut(orgAlias));
				} else if(orgAlias === 'refresh') {
					vscode.window.setStatusBarMessage('Pflaumen SFDX: Refreshing Org List...', getOrgList(true));
				}

			});
		} else {
			vscode.window.setStatusBarMessage('Pflaumen SFDX: Refreshing Org List...', getOrgList(true));
		}
	});

	// cleanup
	vscode.commands.registerCommand('extension.cleanup', () => {
		vscode.window.setStatusBarMessage('Pflaumen SFDX: Cleaning Up...', cleanup());
	});

	// appendToOutputChannel
	context.subscriptions.push(vscode.commands.registerCommand('extension.appendToOutputChannel', (message) => {
		outputChannel.appendLine(new Date().toLocaleTimeString() + ' ' + message);
		outputChannel.show(true);
	}));
}
// this method is called when your extension is deactivated
export function deactivate() { }
