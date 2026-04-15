import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function startClient(context: vscode.ExtensionContext): Promise<LanguageClient | undefined> {
    const cfg = vscode.workspace.getConfiguration('architectureLeak');
    if (!cfg.get<boolean>('enable', true)) {
        return undefined;
    }

    const serverPath = cfg.get<string>('serverPath', '')?.trim() || getBinaryPath(context);

    if (!serverPath || !fs.existsSync(serverPath)) {
        void vscode.window
            .showWarningMessage(
                'Architecture Leak: LSP engine binary not found. ' +
                'Build the Rust engine with `cargo build --release` and copy ' +
                'the binary to the `bin/` directory.',
                'View Docs',
            )
            .then(action => {
                if (action === 'View Docs') {
                    void vscode.env.openExternal(
                        vscode.Uri.parse('https://github.com/architecture-leak/architecture-leak#building-the-engine'),
                    );
                }
            });
        return undefined;
    }

    // Ensure the binary is executable on POSIX
    if (process.platform !== 'win32') {
        try { fs.chmodSync(serverPath, 0o755); } catch { /* ignore */ }
    }

    const serverOptions: ServerOptions = {
        command: serverPath,
        args: [],
        transport: TransportKind.stdio,
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'typescript' },
            { scheme: 'file', language: 'typescriptreact' },
            { scheme: 'file', language: 'javascript' },
            { scheme: 'file', language: 'javascriptreact' },
            { scheme: 'file', language: 'go' },
        ],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.architecture-leak.json'),
        },
        traceOutputChannel: vscode.window.createOutputChannel('Architecture Leak (trace)'),
    };

    client = new LanguageClient(
        'architecture-leak',
        'Architecture Leak',
        serverOptions,
        clientOptions,
    );

    context.subscriptions.push(client);
    await client.start();
    return client;
}

export async function stopClient(): Promise<void> {
    if (client) {
        await client.stop();
        client = undefined;
    }
}

export function getClient(): LanguageClient | undefined {
    return client;
}

// ---------------------------------------------------------------------------
// Platform binary resolution
// ---------------------------------------------------------------------------

function getBinaryName(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'win32') {
        return 'architecture-leak-x86_64-windows.exe';
    }
    if (platform === 'darwin') {
        return arch === 'arm64'
            ? 'architecture-leak-aarch64-macos'
            : 'architecture-leak-x86_64-macos';
    }
    // linux + others
    return arch === 'arm64'
        ? 'architecture-leak-aarch64-linux'
        : 'architecture-leak-x86_64-linux';
}

function getBinaryPath(context: vscode.ExtensionContext): string {
    return path.join(context.extensionPath, 'bin', getBinaryName());
}
