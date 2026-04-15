import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXT_ID = 'sazarcode.architecture-leak';

/** Path to the workspace root of the extension project itself. */
const EXTENSION_ROOT = path.resolve(__dirname, '..', '..');

/** Absolute path to one of the test fixture workspaces. */
function fixturePath(...parts: string[]): string {
    return path.join(EXTENSION_ROOT, 'test-fixtures', ...parts);
}

/**
 * Wait up to `timeoutMs` for `predicate` to return true, polling every `intervalMs`.
 * Throws if the deadline is exceeded.
 */
async function waitFor(
    predicate: () => boolean,
    timeoutMs = 10_000,
    intervalMs = 200,
    label = 'condition',
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) { return; }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timeout waiting for: ${label}`);
}

/**
 * Open a file in the editor and wait for the extension to be active.
 */
async function openFile(filePath: string): Promise<vscode.TextDocument> {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    return doc;
}

/**
 * Wait until diagnostics from 'architecture-leak' source appear for the given uri,
 * or until the timeout expires. Returns the diagnostics array (may be empty).
 */
async function waitForArchDiagnostics(
    uri: vscode.Uri,
    expectAtLeast: number,
    timeoutMs = 15_000,
): Promise<vscode.Diagnostic[]> {
    let diags: vscode.Diagnostic[] = [];
    await waitFor(
        () => {
            diags = vscode.languages
                .getDiagnostics(uri)
                .filter(d => d.source === 'architecture-leak');
            return diags.length >= expectAtLeast;
        },
        timeoutMs,
        300,
        `at least ${expectAtLeast} architecture-leak diagnostic(s) on ${uri.fsPath}`,
    );
    return diags;
}

// ---------------------------------------------------------------------------
// Suite: Sanity checks (no LSP needed)
// ---------------------------------------------------------------------------

suite('1. Sanity checks', () => {
    test('Extension is present in installed extensions list', () => {
        const ext = vscode.extensions.getExtension(EXT_ID);
        assert.ok(ext, `Extension "${EXT_ID}" should be installed`);
    });

    test('Bundled Rust binary exists on disk', () => {
        const binName = process.platform === 'win32'
            ? 'architecture-leak-x86_64-windows.exe'
            : process.arch === 'arm64'
                ? (process.platform === 'darwin' ? 'architecture-leak-aarch64-macos' : 'architecture-leak-aarch64-linux')
                : (process.platform === 'darwin' ? 'architecture-leak-x86_64-macos' : 'architecture-leak-x86_64-linux');
        const binPath = path.join(EXTENSION_ROOT, 'bin', binName);
        assert.ok(fs.existsSync(binPath), `Binary not found: ${binPath}`);
    });

    test('Binary file has non-zero size', () => {
        const binName = process.platform === 'win32'
            ? 'architecture-leak-x86_64-windows.exe'
            : 'architecture-leak-x86_64-linux';
        const binPath = path.join(EXTENSION_ROOT, 'bin', binName);
        if (fs.existsSync(binPath)) {
            const stat = fs.statSync(binPath);
            assert.ok(stat.size > 100_000, `Binary is suspiciously small: ${stat.size} bytes`);
        }
    });

    test('Test fixture: clean-arch has .architecture-leak.json', () => {
        const cfgPath = fixturePath('clean-arch', '.architecture-leak.json');
        assert.ok(fs.existsSync(cfgPath), `Config missing: ${cfgPath}`);
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        assert.ok(Array.isArray(cfg.boundaries.tier0), 'tier0 must be an array');
        assert.ok(Array.isArray(cfg.boundaries.tier1), 'tier1 must be an array');
        assert.ok(Array.isArray(cfg.boundaries.tier2), 'tier2 must be an array');
    });

    test('Test fixture: bad-arch has .architecture-leak.json', () => {
        const cfgPath = fixturePath('bad-arch', '.architecture-leak.json');
        assert.ok(fs.existsSync(cfgPath), `Config missing: ${cfgPath}`);
    });

    test('Test fixture: bad-arch/domain/service.go contains violation import', () => {
        const src = fs.readFileSync(
            fixturePath('bad-arch', 'internal', 'domain', 'service.go'),
            'utf8',
        );
        assert.ok(
            src.includes('badarch/internal/infrastructure'),
            'service.go must import from infrastructure',
        );
    });

    test('Test fixture: bad-arch/application/usecase.go contains violation import', () => {
        const src = fs.readFileSync(
            fixturePath('bad-arch', 'internal', 'application', 'usecase.go'),
            'utf8',
        );
        assert.ok(
            src.includes('badarch/internal/infrastructure'),
            'usecase.go must import from infrastructure',
        );
    });

    test('Test fixture: clean-arch/domain has no infrastructure imports', () => {
        const files = ['user.go', 'errors.go'];
        for (const file of files) {
            const src = fs.readFileSync(
                fixturePath('clean-arch', 'internal', 'domain', file),
                'utf8',
            );
            // Only check actual import lines — not comments
            const importLines = src.split('\n').filter(l => {
                const t = l.trim();
                return t.startsWith('"') || (t.startsWith('import') && t.includes('"'));
            });
            const violations = importLines.filter(
                l => l.includes('infrastructure') || l.includes('application'),
            );
            assert.strictEqual(
                violations.length,
                0,
                `${file} must not import from outer tiers, found: ${violations.join(', ')}`,
            );
        }
    });

    test('Test fixture: clean-arch/application only imports domain', () => {
        const files = ['create_user.go', 'get_user.go'];
        for (const file of files) {
            const src = fs.readFileSync(
                fixturePath('clean-arch', 'internal', 'application', file),
                'utf8',
            );
            const importLines = src.split('\n').filter(l => {
                const t = l.trim();
                return t.startsWith('"') && t.includes('/');
            });
            const violations = importLines.filter(l => l.includes('infrastructure'));
            assert.strictEqual(
                violations.length,
                0,
                `${file} must not import from infrastructure, found: ${violations.join(', ')}`,
            );
        }
    });
});

// ---------------------------------------------------------------------------
// Suite: Extension activation
// ---------------------------------------------------------------------------

suite('2. Extension activation', () => {
    suiteSetup(async () => {
        // Activate the extension explicitly if not yet active
        const ext = vscode.extensions.getExtension(EXT_ID);
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    test('Extension activates successfully', async () => {
        const ext = vscode.extensions.getExtension(EXT_ID);
        assert.ok(ext, 'Extension must be installed');
        // Allow activation up to 5s
        await waitFor(() => ext.isActive, 5_000, 100, 'extension active');
        assert.strictEqual(ext.isActive, true, 'Extension must be active');
    });

    test('Command: architecture-leak.createConfig is registered', async () => {
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(cmds.includes('architecture-leak.createConfig'), 'createConfig command missing');
    });

    test('Command: architecture-leak.createConfigQuick is registered', async () => {
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(cmds.includes('architecture-leak.createConfigQuick'), 'createConfigQuick command missing');
    });

    test('Command: architecture-leak.showWelcome is registered', async () => {
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(cmds.includes('architecture-leak.showWelcome'), 'showWelcome command missing');
    });

    test('Command: architecture-leak.showViolationsReport is registered', async () => {
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(cmds.includes('architecture-leak.showViolationsReport'), 'showViolationsReport command missing');
    });

    test('Command: architecture-leak.reloadConfig is registered', async () => {
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(cmds.includes('architecture-leak.reloadConfig'), 'reloadConfig command missing');
    });
});

// ---------------------------------------------------------------------------
// Suite: Clean architecture project — ZERO violations expected
// ---------------------------------------------------------------------------

suite('3. Clean-arch Go project — no violations', function () {
    this.timeout(30_000);

    test('Domain entity (user.go) generates no diagnostics', async () => {
        const file = fixturePath('clean-arch', 'internal', 'domain', 'user.go');
        const doc = await openFile(file);

        // Give the LSP server a chance to process; if violations appear that's a bug.
        await new Promise(r => setTimeout(r, 5_000));

        const diags = vscode.languages
            .getDiagnostics(doc.uri)
            .filter(d => d.source === 'architecture-leak');

        assert.strictEqual(
            diags.length,
            0,
            `Domain entity must have 0 violations, got:\n${diags.map(d => d.message).join('\n')}`,
        );
    });

    test('Application layer (create_user.go) generates no diagnostics', async () => {
        const file = fixturePath('clean-arch', 'internal', 'application', 'create_user.go');
        const doc = await openFile(file);

        await new Promise(r => setTimeout(r, 5_000));

        const diags = vscode.languages
            .getDiagnostics(doc.uri)
            .filter(d => d.source === 'architecture-leak');

        assert.strictEqual(
            diags.length,
            0,
            `Application use case must have 0 violations, got:\n${diags.map(d => d.message).join('\n')}`,
        );
    });

    test('Infrastructure HTTP handler generates no diagnostics', async () => {
        const file = fixturePath('clean-arch', 'internal', 'infrastructure', 'http_handler.go');
        const doc = await openFile(file);

        await new Promise(r => setTimeout(r, 5_000));

        const diags = vscode.languages
            .getDiagnostics(doc.uri)
            .filter(d => d.source === 'architecture-leak');

        assert.strictEqual(
            diags.length,
            0,
            `Infrastructure HTTP handler must have 0 violations, got:\n${diags.map(d => d.message).join('\n')}`,
        );
    });
});

// ---------------------------------------------------------------------------
// Suite: Bad architecture project — violations MUST be detected
// ---------------------------------------------------------------------------

suite('4. Bad-arch Go project — violations must be detected', function () {
    this.timeout(30_000);

    test('domain/service.go: reports Domain→Infrastructure violation', async () => {
        const file = fixturePath('bad-arch', 'internal', 'domain', 'service.go');
        const doc = await openFile(file);

        // Give the LSP time to process; collect whatever diagnostics appear
        await new Promise(r => setTimeout(r, 8_000));

        const allDiags = vscode.languages.getDiagnostics(doc.uri);
        const archDiags = allDiags.filter(d => d.source === 'architecture-leak');

        // Debug: log all diagnostics so we can see what sources appear
        console.log(`[service.go] all diags (${allDiags.length}):`, allDiags.map(d => `[${d.source}] ${d.message}`).join('; ') || '(none)');
        console.log(`[service.go] arch diags: ${archDiags.length}`);

        assert.ok(
            archDiags.length >= 1,
            `Expected at least 1 architecture violation in domain/service.go, got ${archDiags.length}.\nAll diagnostics: ${allDiags.map(d => `[${d.source}] ${d.message}`).join('; ') || '(none)'}`,
        );

        const violationMsg = archDiags[0].message;
        assert.ok(
            violationMsg.toLowerCase().includes('domain') ||
            violationMsg.toLowerCase().includes('violation') ||
            violationMsg.toLowerCase().includes('tier 0'),
            `Unexpected violation message: "${violationMsg}"`,
        );
    });

    test('domain/service.go: violation has Error severity', async () => {
        const file = fixturePath('bad-arch', 'internal', 'domain', 'service.go');
        const doc = await openFile(file);

        const diags = await waitForArchDiagnostics(doc.uri, 1, 20_000);

        assert.ok(
            diags.some(d => d.severity === vscode.DiagnosticSeverity.Error),
            'At least one diagnostic must be an Error (config severity: "error")',
        );
    });

    test('application/usecase.go: reports Application→Infrastructure violation', async () => {
        const file = fixturePath('bad-arch', 'internal', 'application', 'usecase.go');
        const doc = await openFile(file);

        const diags = await waitForArchDiagnostics(doc.uri, 1, 20_000);

        assert.ok(
            diags.length >= 1,
            `Expected at least 1 architecture violation in application/usecase.go, got ${diags.length}`,
        );

        const violationMsg = diags[0].message;
        assert.ok(
            violationMsg.toLowerCase().includes('application') ||
            violationMsg.toLowerCase().includes('violation') ||
            violationMsg.toLowerCase().includes('tier 1'),
            `Unexpected violation message: "${violationMsg}"`,
        );
    });

    test('infrastructure/db.go: no violations (infra can import anything)', async () => {
        const file = fixturePath('bad-arch', 'internal', 'infrastructure', 'db.go');
        const doc = await openFile(file);

        // Wait a bit — we expect 0 diagnostics
        await new Promise(r => setTimeout(r, 5_000));

        const diags = vscode.languages
            .getDiagnostics(doc.uri)
            .filter(d => d.source === 'architecture-leak');

        assert.strictEqual(
            diags.length,
            0,
            `Infrastructure db.go must have 0 violations, got:\n${diags.map(d => d.message).join('\n')}`,
        );
    });
});

// ---------------------------------------------------------------------------
// Suite: Config schema validation
// ---------------------------------------------------------------------------

suite('5. Config schema', () => {
    test('Valid config parses without errors', () => {
        const cfg = JSON.parse(JSON.stringify({
            boundaries: {
                tier0: ['internal/domain'],
                tier1: ['internal/application'],
                tier2: ['internal/infrastructure'],
            },
            options: { severity: 'error', exclude: ['**/*_test.go'] },
        }));
        assert.ok(Array.isArray(cfg.boundaries.tier0));
        assert.strictEqual(cfg.options.severity, 'error');
    });

    test('clean-arch config has correct tier paths', () => {
        const cfgPath = fixturePath('clean-arch', '.architecture-leak.json');
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        assert.deepStrictEqual(cfg.boundaries.tier0, ['internal/domain']);
        assert.deepStrictEqual(cfg.boundaries.tier1, ['internal/application']);
        assert.deepStrictEqual(cfg.boundaries.tier2, ['internal/infrastructure']);
    });

    test('bad-arch config has correct tier paths', () => {
        const cfgPath = fixturePath('bad-arch', '.architecture-leak.json');
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        assert.deepStrictEqual(cfg.boundaries.tier0, ['internal/domain']);
        assert.deepStrictEqual(cfg.boundaries.tier1, ['internal/application']);
        assert.deepStrictEqual(cfg.boundaries.tier2, ['internal/infrastructure']);
    });
});

// ---------------------------------------------------------------------------
// Helper: send/receive raw LSP messages over a child process
// ---------------------------------------------------------------------------

function lspMessage(obj: object): Buffer {
    const body = JSON.stringify(obj);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
    return Buffer.concat([Buffer.from(header), Buffer.from(body)]);
}

type LspNotification = { jsonrpc: string; method: string; params: unknown };

/**
 * Spawn the LSP binary, send a sequence of messages, and collect all
 * `textDocument/publishDiagnostics` notifications received within `timeoutMs`.
 */
function runLspSession(
    binPath: string,
    messages: object[],
    timeoutMs = 5_000,
): Promise<LspNotification[]> {
    return new Promise((resolve, reject) => {
        const proc = spawn(binPath, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });

        const notifications: LspNotification[] = [];
        // Use a Buffer to correctly handle byte-length Content-Length vs JS string chars
        let rawBuf = Buffer.alloc(0);

        proc.stdout.on('data', (chunk: Buffer) => {
            rawBuf = Buffer.concat([rawBuf, chunk]);
            // Parse LSP messages: header + body (using byte offsets throughout)
            while (true) {
                const sep = rawBuf.indexOf('\r\n\r\n');
                if (sep === -1) { break; }
                const header = rawBuf.slice(0, sep).toString('ascii');
                const lenMatch = header.match(/Content-Length:\s*(\d+)/i);
                if (!lenMatch) { break; }
                const bodyLen = parseInt(lenMatch[1], 10);
                const bodyStart = sep + 4;
                if (rawBuf.length < bodyStart + bodyLen) { break; }
                const body = rawBuf.slice(bodyStart, bodyStart + bodyLen).toString('utf8');
                rawBuf = rawBuf.slice(bodyStart + bodyLen);
                try {
                    const msg = JSON.parse(body) as LspNotification;
                    if (msg.method === 'textDocument/publishDiagnostics') {
                        notifications.push(msg);
                    }
                } catch { /* ignore malformed */ }
            }
        });

        proc.stderr.on('data', (chunk: Buffer) => {
            // Engine stderr — ignore or log for debugging
            console.log('[engine stderr]', chunk.toString().trim());
        });

        proc.on('error', reject);

        // Send all messages with small delays
        let delay = 50;
        for (const msg of messages) {
            setTimeout(() => {
                proc.stdin.write(lspMessage(msg));
            }, delay);
            delay += 100;
        }

        // Close stdin and resolve after timeout
        setTimeout(() => {
            proc.stdin.end();
            setTimeout(() => {
                proc.kill();
                resolve(notifications);
            }, 500);
        }, timeoutMs);
    });
}

// ---------------------------------------------------------------------------
// Suite 6: Direct binary LSP protocol tests (no VS Code extension involved)
// ---------------------------------------------------------------------------

suite('6. Engine binary — direct LSP protocol', function () {
    this.timeout(15_000);

    const binPath = (() => {
        const name = process.platform === 'win32'
            ? 'architecture-leak-x86_64-windows.exe'
            : 'architecture-leak-x86_64-linux';
        return path.join(EXTENSION_ROOT, 'bin', name);
    })();

    function makeUri(filePath: string): string {
        // Convert Windows path to file URI
        const normalized = filePath.replace(/\\/g, '/');
        return `file:///${normalized.replace(/^\//, '')}`;
    }

    test('Binary: domain/service.go produces a violation diagnostic', async () => {
        if (!fs.existsSync(binPath)) { return; } // skip on unsupported platform

        const workspaceRoot = fixturePath('bad-arch');
        const serviceGoPath = fixturePath('bad-arch', 'internal', 'domain', 'service.go');
        const serviceGoContent = fs.readFileSync(serviceGoPath, 'utf8');

        const notifications = await runLspSession(binPath, [
            {
                jsonrpc: '2.0', id: 1, method: 'initialize',
                params: {
                    rootUri: makeUri(workspaceRoot),
                    capabilities: {},
                    workspaceFolders: [{ uri: makeUri(workspaceRoot), name: 'bad-arch' }],
                },
            },
            { jsonrpc: '2.0', method: 'initialized', params: {} },
            {
                jsonrpc: '2.0', method: 'textDocument/didOpen',
                params: {
                    textDocument: {
                        uri: makeUri(serviceGoPath),
                        languageId: 'go',
                        version: 1,
                        text: serviceGoContent,
                    },
                },
            },
        ], 5_000);

        console.log('[direct] publishDiagnostics count:', notifications.length);
        notifications.forEach(n => {
            const p = n.params as { uri: string; diagnostics: Array<{message: string}> };
            console.log(`  [${p.uri}] ${p.diagnostics.length} diag(s):`);
            p.diagnostics.forEach(d => console.log('    -', d.message));
        });

        const diagNotif = notifications.find(n => {
            const p = n.params as { uri: string; diagnostics: Array<unknown> };
            return p.uri.includes('service.go') && p.diagnostics.length > 0;
        });

        assert.ok(
            diagNotif !== undefined,
            `Expected at least one publishDiagnostics for service.go with violations.\nGot ${notifications.length} notifications total.`,
        );

        const diags = (diagNotif!.params as { diagnostics: Array<{message: string; source?: string}> }).diagnostics;
        const violationMsg = diags[0].message;
        assert.ok(
            violationMsg.toLowerCase().includes('violation') ||
            violationMsg.toLowerCase().includes('tier') ||
            violationMsg.toLowerCase().includes('domain'),
            `Unexpected message: "${violationMsg}"`,
        );
    });

    test('Binary: clean-arch/domain/user.go produces NO violations', async () => {
        if (!fs.existsSync(binPath)) { return; }

        const workspaceRoot = fixturePath('clean-arch');
        const userGoPath = fixturePath('clean-arch', 'internal', 'domain', 'user.go');
        const userGoContent = fs.readFileSync(userGoPath, 'utf8');

        const notifications = await runLspSession(binPath, [
            {
                jsonrpc: '2.0', id: 1, method: 'initialize',
                params: {
                    rootUri: makeUri(workspaceRoot),
                    capabilities: {},
                    workspaceFolders: [{ uri: makeUri(workspaceRoot), name: 'clean-arch' }],
                },
            },
            { jsonrpc: '2.0', method: 'initialized', params: {} },
            {
                jsonrpc: '2.0', method: 'textDocument/didOpen',
                params: {
                    textDocument: {
                        uri: makeUri(userGoPath),
                        languageId: 'go',
                        version: 1,
                        text: userGoContent,
                    },
                },
            },
        ], 5_000);

        const diagNotif = notifications.find(n => {
            const p = n.params as { uri: string; diagnostics: Array<unknown> };
            return p.uri.includes('user.go');
        });

        // Either no notification at all, or a notification with 0 diagnostics
        const diagCount = diagNotif
            ? (diagNotif.params as { diagnostics: Array<unknown> }).diagnostics.length
            : 0;

        assert.strictEqual(
            diagCount,
            0,
            `Domain entity must have 0 violations, got ${diagCount}`,
        );
    });

    test('Binary: application/usecase.go in bad-arch produces a violation', async () => {
        if (!fs.existsSync(binPath)) { return; }

        const workspaceRoot = fixturePath('bad-arch');
        const usecasePath = fixturePath('bad-arch', 'internal', 'application', 'usecase.go');
        const usecaseContent = fs.readFileSync(usecasePath, 'utf8');

        const notifications = await runLspSession(binPath, [
            {
                jsonrpc: '2.0', id: 1, method: 'initialize',
                params: {
                    rootUri: makeUri(workspaceRoot),
                    capabilities: {},
                    workspaceFolders: [{ uri: makeUri(workspaceRoot), name: 'bad-arch' }],
                },
            },
            { jsonrpc: '2.0', method: 'initialized', params: {} },
            {
                jsonrpc: '2.0', method: 'textDocument/didOpen',
                params: {
                    textDocument: {
                        uri: makeUri(usecasePath),
                        languageId: 'go',
                        version: 1,
                        text: usecaseContent,
                    },
                },
            },
        ], 5_000);

        const diagNotif = notifications.find(n => {
            const p = n.params as { uri: string; diagnostics: Array<unknown> };
            return p.uri.includes('usecase.go') && p.diagnostics.length > 0;
        });

        assert.ok(
            diagNotif !== undefined,
            `Expected violation in application/usecase.go. Got ${notifications.length} notifications.`,
        );
    });
});
