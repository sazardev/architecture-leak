import * as vscode from 'vscode';
import { startClient, stopClient } from './client';
import { StatusBarController } from './statusBar';
import { WelcomePanel } from './welcomePanel';
import { createConfigWizard, createConfigQuick } from './configCreator';

const statusBar = new StatusBarController();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Status bar — always visible once activated
    statusBar.init(context);

    // Show welcome panel on first ever launch
    const welcomed = context.globalState.get<boolean>('architectureLeak.welcomed', false);
    if (!welcomed) {
        await context.globalState.update('architectureLeak.welcomed', true);
        WelcomePanel.createOrShow(context);
    }

    // Register all commands
    context.subscriptions.push(
        vscode.commands.registerCommand('architecture-leak.createConfig', () =>
            createConfigWizard(context),
        ),
        vscode.commands.registerCommand('architecture-leak.createConfigQuick', () =>
            createConfigQuick(context),
        ),
        vscode.commands.registerCommand('architecture-leak.showWelcome', () =>
            WelcomePanel.createOrShow(context),
        ),
        vscode.commands.registerCommand('architecture-leak.showViolationsReport', () =>
            vscode.commands.executeCommand('workbench.actions.view.problems'),
        ),
        vscode.commands.registerCommand('architecture-leak.reloadConfig', async () => {
            statusBar.setLoading();
            await stopClient();
            const client = await startClient(context);
            if (client) {
                statusBar.setOk(0);
                vscode.window.showInformationMessage('Architecture Leak: config reloaded.');
            } else {
                statusBar.setDisabled();
            }
        }),
    );

    // Start the Rust LSP engine
    statusBar.setLoading();
    const client = await startClient(context);
    if (client) {
        statusBar.setOk(0);
    } else {
        const cfg = vscode.workspace.getConfiguration('architectureLeak');
        if (!cfg.get<boolean>('enable', true)) {
            statusBar.setDisabled();
        } else {
            statusBar.setError('binary not found — see output panel');
        }
    }
}

export async function deactivate(): Promise<void> {
    await stopClient();
    statusBar.dispose();
}
