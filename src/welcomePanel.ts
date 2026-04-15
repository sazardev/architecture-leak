import * as vscode from 'vscode';

const VIEW_TYPE = 'architectureLeakWelcome';

export class WelcomePanel {
    private static current: WelcomePanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];

    static createOrShow(context: vscode.ExtensionContext): void {
        const col = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (WelcomePanel.current) {
            WelcomePanel.current.panel.reveal(col);
            return;
        }

        const panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'Architecture Leak', col, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });

        WelcomePanel.current = new WelcomePanel(panel, context);
    }

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        this.panel = panel;

        const pkgVersion: string = (function () {
            try {
                const pkg = require('../package.json') as { version: string };
                return pkg.version;
            } catch {
                return '0.1.0';
            }
        })();

        this.refresh(pkgVersion);

        // Re-render when VS Code theme changes
        this.disposables.push(
            vscode.window.onDidChangeActiveColorTheme(() => this.refresh(pkgVersion)),
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        this.panel.webview.onDidReceiveMessage(msg => {
            switch ((msg as { command: string }).command) {
                case 'createConfig':
                    void vscode.commands.executeCommand('architecture-leak.createConfig');
                    break;
                case 'createConfigQuick':
                    void vscode.commands.executeCommand('architecture-leak.createConfigQuick');
                    break;
                case 'openProblems':
                    void vscode.commands.executeCommand('workbench.actions.view.problems');
                    break;
                case 'openDocs':
                    void vscode.env.openExternal(
                        vscode.Uri.parse('https://github.com/architecture-leak/architecture-leak#readme'),
                    );
                    break;
            }
        }, null, this.disposables);

        context.subscriptions.push({ dispose: () => this.dispose() });
    }

    private refresh(version: string): void {
        const isDark =
            vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.Light &&
            vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.HighContrastLight;
        this.panel.webview.html = getHtml(version, isDark);
    }

    private dispose(): void {
        WelcomePanel.current = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables.length = 0;
    }
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let n = '';
    for (let i = 0; i < 32; i++) {
        n += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return n;
}

function getHtml(version: string, dark: boolean): string {
    const nonce = getNonce();

    const bg       = dark ? '#1d2021' : '#fbf1c7';
    const bg1      = dark ? '#282828' : '#f2e5bc';
    const bg2      = dark ? '#3c3836' : '#ebdbb2';
    const fg       = dark ? '#ebdbb2' : '#3c3836';
    const fg2      = dark ? '#a89984' : '#7c6f64';
    const orange   = dark ? '#fe8019' : '#d65d0e';
    const yellow   = dark ? '#fabd2f' : '#b57614';
    const green    = dark ? '#b8bb26' : '#79740e';
    const red      = dark ? '#fb4934' : '#cc241d';
    const blue     = dark ? '#83a598' : '#076678';
    const aqua     = dark ? '#8ec07c' : '#427b58';

    const ascii = String.raw`
  ╭───────────────────────────────────────────────────────────╮
  │                                                           │
  │   ██████╗  ██████╗██╗  ██╗    ██╗     ███████╗ █████╗ ██╗│
  │   ██╔══██╗██╔════╝██║  ██║    ██║     ██╔════╝██╔══██╗██║│
  │   ███████║██████╗ ███████║    ██║     █████╗  ███████║██║│
  │   ██╔══██║██╔══╝  ██╔══██║    ██║     ██╔══╝  ██╔══██║██╔╝
  │   ██║  ██║╚██████╗██║  ██║    ███████╗███████╗██║  ██║██║│
  │   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝   ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝│
  │                                                           │
  │        ⬡  Hexagonal Architecture Guardian  ⬡             │
  │              ⌀  Powered by Rust  ⌀                       │
  │                                                           │
  ╰───────────────────────────────────────────────────────────╯`.trimStart();

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Architecture Leak</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:     ${bg};
    --bg1:    ${bg1};
    --bg2:    ${bg2};
    --fg:     ${fg};
    --fg2:    ${fg2};
    --orange: ${orange};
    --yellow: ${yellow};
    --green:  ${green};
    --red:    ${red};
    --blue:   ${blue};
    --aqua:   ${aqua};
  }
  body {
    background: var(--bg);
    color: var(--fg);
    font-family: 'Segoe UI', system-ui, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2.5rem 1.5rem;
    gap: 2rem;
  }
  pre.ascii {
    font-family: 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
    font-size: clamp(0.5rem, 1.1vw, 0.78rem);
    line-height: 1.35;
    color: var(--orange);
    background: var(--bg1);
    border: 1px solid var(--bg2);
    border-radius: 10px;
    padding: 1.4rem 2rem;
    white-space: pre;
    overflow-x: auto;
    max-width: 100%;
    text-shadow: 0 0 14px color-mix(in srgb, var(--orange) 40%, transparent);
  }
  .badge {
    font-size: 0.7rem;
    font-family: monospace;
    background: var(--bg2);
    color: var(--fg2);
    border-radius: 999px;
    padding: 0.2rem 0.75rem;
    letter-spacing: 0.05em;
  }
  .badge span { color: var(--orange); }
  .tagline {
    font-size: 0.95rem;
    color: var(--fg2);
    text-align: center;
    max-width: 520px;
    line-height: 1.6;
  }
  .tagline strong { color: var(--yellow); }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
  }
  button {
    cursor: pointer;
    border: none;
    border-radius: 6px;
    padding: 0.55rem 1.2rem;
    font-size: 0.875rem;
    font-weight: 600;
    transition: filter 0.15s, transform 0.1s;
    letter-spacing: 0.02em;
  }
  button:hover  { filter: brightness(1.15); }
  button:active { transform: scale(0.97); }
  .btn-primary   { background: var(--orange); color: #1d2021; }
  .btn-secondary { background: var(--bg2);    color: var(--fg); }
  .btn-ghost     { background: transparent;   color: var(--aqua);
                   border: 1px solid var(--aqua); }
  .hints {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 1rem;
    width: 100%;
    max-width: 700px;
  }
  .hint-card {
    background: var(--bg1);
    border: 1px solid var(--bg2);
    border-radius: 8px;
    padding: 0.9rem 1.1rem;
  }
  .hint-card h4 { color: var(--yellow); font-size: 0.82rem; margin-bottom: 0.35rem; }
  .hint-card p  { color: var(--fg2);   font-size: 0.78rem; line-height: 1.5; }
  .hint-card code {
    background: var(--bg2);
    color: var(--green);
    border-radius: 4px;
    padding: 0.1rem 0.35rem;
    font-size: 0.75rem;
  }
  footer {
    color: var(--fg2);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-align: center;
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid var(--bg2);
    width: 100%;
    max-width: 700px;
  }
</style>
</head>
<body>

<pre class="ascii">${ascii}</pre>

<div class="badge">v<span>${version}</span> &nbsp;·&nbsp; <span>Rust</span> engine &nbsp;·&nbsp; TS/JS &amp; Go</div>

<p class="tagline">
  Enforce the <strong>Dependency Rule</strong> automatically. Keep your
  <strong>Domain</strong> pure, your <strong>Application</strong> clean,
  and your <strong>Infrastructure</strong> in its place.
</p>

<div class="actions">
  <button class="btn-primary"   onclick="send('createConfig')">⬡ Create Config (Wizard)</button>
  <button class="btn-secondary" onclick="send('createConfigQuick')">⚡ Quick Config</button>
  <button class="btn-ghost"     onclick="send('openProblems')">⚠ Violations Panel</button>
  <button class="btn-ghost"     onclick="send('openDocs')">📖 Docs</button>
</div>

<div class="hints">
  <div class="hint-card">
    <h4>⬡ Tier 0 — Domain</h4>
    <p>Pure business logic. <strong>Zero</strong> external imports. Add paths like <code>src/domain</code>.</p>
  </div>
  <div class="hint-card">
    <h4>▷ Tier 1 — Application</h4>
    <p>Use cases &amp; orchestration. May only reference <code>Tier 0</code>.</p>
  </div>
  <div class="hint-card">
    <h4>⬡ Tier 2 — Infrastructure</h4>
    <p>Adapters, DB, APIs. Permitted to reference <code>Tier 0</code> and <code>Tier 1</code>.</p>
  </div>
  <div class="hint-card">
    <h4>⚡ Config file</h4>
    <p>Place <code>.architecture-leak.json</code> at your project root. Full JSON schema validation included.</p>
  </div>
</div>

<footer>architecture-leak &nbsp;·&nbsp; Powered by Rust &nbsp;·&nbsp; MIT License</footer>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  function send(command) { vscode.postMessage({ command }); }
</script>
</body>
</html>`;
}
