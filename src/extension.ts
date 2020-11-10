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

	async function getAllFields(sObjectName: string, printToTerminal: Boolean) {
		if(sObjectName.length === 0) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Error: 0 length string received');
			infoMessageFail();
			return;
		}
		let runTmpApexCmd = 'echo "String sObjectName = \''+sObjectName+'\';'+code+'" | sfdx force:apex:execute | grep --line-buffered "USER_DEBUG" | echo "{$(cut -d "{" -f2-)"';
		let fieldResponse = await callExec(runTmpApexCmd);
		if(fieldResponse.status === 'error') {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: '+fieldResponse.message);
			return;
		}
		let sObjectFields = JSON.parse(fieldResponse.message);
		if(sObjectFields.message) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: '+sObjectFields.message);
			infoMessageFail();
			return;
		}
		if(printToTerminal) {
			let fieldList = '';
			for(let key in sObjectFields[sObjectName!]) {
				fieldList += sObjectFields[sObjectName!][key] + ',';
			}
			fieldList = fieldList.slice(0, -1);
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: '+fieldList);
			vscode.window.showInformationMessage('Pflaumen SFDX: Done');
		}
		return sObjectFields;
	}

	async function soqlQueryAll(resFileName: String | undefined) {
		try {
			let editor = vscode.window.activeTextEditor;
			let selection = editor?.selection;
			let text = editor?.document.getText(selection);
			if(text?.match(/SELECT.*FROM.*/i) === null) {
				vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Invalid string <'+text+'>');
				infoMessageFail();
				return;
			}
			let afterFrom = text?.split(/FROM/i)[1].trim();
			let objName = afterFrom?.split(' ')[0].trim();
			let qualifierTokens = afterFrom?.split(' ');
			let qualifiers = ' ';
			for(let tokenIndex = 1; tokenIndex < qualifierTokens!.length; tokenIndex++) {
				qualifiers += qualifierTokens![tokenIndex] + ' ';
			}
			let sObjectFields = await getAllFields(objName!, false);
			if(!sObjectFields) { return; }
			let dynamicSoqlQuery = 'SELECT ';
			for(let key in sObjectFields[objName!]) {
				dynamicSoqlQuery += sObjectFields[objName!][key] + ',';
			}
			dynamicSoqlQuery = dynamicSoqlQuery.slice(0, -1);
			dynamicSoqlQuery += ' FROM '+objName;
			if(qualifiers.length > 1) {
				dynamicSoqlQuery += qualifiers;
			}
			let runSoqlCmd = 'sfdx force:data:soql:query -q "'+dynamicSoqlQuery+'" -r=csv';
			let queryResponse = await callExec(runSoqlCmd);
			if(queryResponse.status === 'error') {
				vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Errors during query <'+queryResponse.message+'>');
				infoMessageFail();
				return;
			}
			if(resFileName) {
				let strippedPossibleExtension = resFileName.split(/\.csv/i)[0];
				let escapedMessage = queryResponse.message.replace(/'/g, '\\\'').replace(/"/g, '\\"');
				let writeFileCmd = 'echo "'+escapedMessage+'" > '+strippedPossibleExtension+'.csv';
				let writeResponse = await callExec(writeFileCmd);
				if(writeResponse.status === 'error') {
					vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Errors writing file <'+queryResponse.message+'>');
					infoMessageFail();
					return;
				}
			} else {
				vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + queryResponse.message);
			}
			vscode.window.showInformationMessage('Pflaumen SFDX: Done');
		} catch(err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: '+err);
			infoMessageFail();
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

	async function infoMessageFail() {
		vscode.window.showInformationMessage('Pflaumen SFDX: Error');
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

	vscode.commands.registerCommand('extension.getSObjectFields', () => {
		vscode.window.showInputBox({
			placeHolder: 'Name of sObject to retrieve field metadata for',
			prompt: 'sObject Name'
		}).then(name => {
			if(name && name.length > 0) {
				vscode.window.showInformationMessage('Pflaumen SFDX: Retrieving fields...');
				vscode.window.setStatusBarMessage('Pflaumen SFDX: Retrieving fields...', getAllFields(name, true));
			} else {
				vscode.window.showInformationMessage('Pflaumen SFDX: Error');
				vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Error: 0 length string received');
			}
		});
	});

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

	// track metadata
	vscode.commands.registerCommand('extension.trackMetadata', () => {
		vscode.window.showInformationMessage('Pflaumen SFDX: Running Track Metadata...');
		vscode.window.showInputBox({
			placeHolder: 'CustomObject, Layout, etc.',
			prompt: 'Metadata Type'
		}).then(metadataType => {
			if(!metadataType) {
				return;
			}
			vscode.window.setStatusBarMessage('Pflaumen SFDX: Tracking Metadata...', promptForFileName(metadataType));
		});
	});

	async function promptForFileName(metadataType: string | undefined) {
		vscode.window.showInputBox({
			placeHolder: 'API name of the file to track.',
			prompt: 'File Name'
		}).then(fileName => {
			if(!fileName) {
				return;
			}
			trackMetadata(metadataType, fileName);
		});
	}

	async function trackMetadata(metadataType:string | undefined, fileName:string | undefined) {
		try {
			const externalId = metadataType + '|' + fileName;
			const combinedCommand = `sfdx force:data:record:create -s MDTKR__MetadataFile__c -v "Name='`+fileName+`' MDTKR__ExternalId__c='`+externalId +`' MDTKR__Type__c=`+metadataType+`"`;
			console.log('combinedCommand: '+combinedCommand);
			const { stdout, stderr } = await exec(combinedCommand, { cwd: fsPath });
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + stdout);
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Tracking Metadata Finished');
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	// appendToOutputChannel
	context.subscriptions.push(vscode.commands.registerCommand('extension.appendToOutputChannel', (message) => {
		outputChannel.appendLine(new Date().toLocaleTimeString() + ' ' + message);
		outputChannel.show(true);
	}));
}
// this method is called when your extension is deactivated
export function deactivate() { }
