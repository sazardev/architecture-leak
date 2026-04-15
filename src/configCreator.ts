import * as path from 'path';
import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArchConfig {
    boundaries: {
        tier0: string[];
        tier1: string[];
        tier2: string[];
    };
    options: {
        severity: 'error' | 'warning';
        exclude: string[];
    };
}

// ---------------------------------------------------------------------------
// Wizard (Webview)
// ---------------------------------------------------------------------------

export async function createConfigWizard(context: vscode.ExtensionContext): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('Architecture Leak: Please open a workspace folder first.');
        return;
    }

    if (await configExists(workspaceRoot)) {
        const choice = await vscode.window.showWarningMessage(
            '.architecture-leak.json already exists. Overwrite it?',
            { modal: true },
            'Overwrite',
        );
        if (choice !== 'Overwrite') { return; }
    }

    const panel = vscode.window.createWebviewPanel(
        'architectureLeakConfigWizard',
        '⬡ Architecture Leak — Config Wizard',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true },
    );

    const isDark =
        vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.Light &&
        vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.HighContrastLight;

    panel.webview.html = getWizardHtml(isDark);

    const disposables: vscode.Disposable[] = [];

    panel.webview.onDidReceiveMessage(
        async (msg: { command: string; config?: ArchConfig }) => {
            if (msg.command === 'finish' && msg.config) {
                try {
                    await writeConfig(workspaceRoot, msg.config);
                    panel.dispose();
                    void vscode.window.showInformationMessage(
                        '✔ .architecture-leak.json created successfully!',
                        'Open File',
                    ).then(action => {
                        if (action === 'Open File') {
                            void vscode.workspace.openTextDocument(
                                path.join(workspaceRoot, '.architecture-leak.json'),
                            ).then(doc => vscode.window.showTextDocument(doc));
                        }
                    });
                } catch (err) {
                    vscode.window.showErrorMessage(`Architecture Leak: Failed to write config — ${String(err)}`);
                }
            } else if (msg.command === 'cancel') {
                panel.dispose();
            }
        },
        null,
        disposables,
    );

    panel.onDidDispose(() => {
        disposables.forEach(d => d.dispose());
    }, null, context.subscriptions);
}

// ---------------------------------------------------------------------------
// Quick Pick Flow
// ---------------------------------------------------------------------------

export async function createConfigQuick(context: vscode.ExtensionContext): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('Architecture Leak: Please open a workspace folder first.');
        return;
    }

    if (await configExists(workspaceRoot)) {
        const choice = await vscode.window.showWarningMessage(
            '.architecture-leak.json already exists. Overwrite it?',
            { modal: true },
            'Overwrite',
        );
        if (choice !== 'Overwrite') { return; }
    }

    const tier0Raw = await vscode.window.showInputBox({
        title: 'Architecture Leak — Step 1/4: Tier 0 (Domain)',
        prompt: 'Comma-separated directory paths for the Domain tier (e.g. src/domain, pkg/entities)',
        placeHolder: 'src/domain',
        validateInput: v => v.trim() ? undefined : 'At least one path is required',
    });
    if (tier0Raw === undefined) { return; }

    const tier1Raw = await vscode.window.showInputBox({
        title: 'Architecture Leak — Step 2/4: Tier 1 (Application)',
        prompt: 'Comma-separated directory paths for the Application tier (e.g. src/application)',
        placeHolder: 'src/application',
        validateInput: v => v.trim() ? undefined : 'At least one path is required',
    });
    if (tier1Raw === undefined) { return; }

    const tier2Raw = await vscode.window.showInputBox({
        title: 'Architecture Leak — Step 3/4: Tier 2 (Infrastructure)',
        prompt: 'Comma-separated directory paths for the Infrastructure tier (e.g. src/infrastructure)',
        placeHolder: 'src/infrastructure',
        validateInput: v => v.trim() ? undefined : 'At least one path is required',
    });
    if (tier2Raw === undefined) { return; }

    const severity = await vscode.window.showQuickPick(
        [
            { label: '$(error) error', description: 'Violations shown as errors', value: 'error' as const },
            { label: '$(warning) warning', description: 'Violations shown as warnings', value: 'warning' as const },
        ],
        { title: 'Architecture Leak — Step 4/4: Severity', placeHolder: 'Choose diagnostic severity' },
    );
    if (!severity) { return; }

    const config: ArchConfig = {
        boundaries: {
            tier0: parsePaths(tier0Raw),
            tier1: parsePaths(tier1Raw),
            tier2: parsePaths(tier2Raw),
        },
        options: {
            severity: severity.value,
            exclude: [],
        },
    };

    try {
        await writeConfig(workspaceRoot, config);
        void vscode.window.showInformationMessage(
            '✔ .architecture-leak.json created!',
            'Open File',
        ).then(action => {
            if (action === 'Open File') {
                void vscode.workspace.openTextDocument(
                    path.join(workspaceRoot, '.architecture-leak.json'),
                ).then(doc => vscode.window.showTextDocument(doc));
            }
        });
    } catch (err) {
        vscode.window.showErrorMessage(`Architecture Leak: Failed to write config — ${String(err)}`);
    }

    void context; // suppress unused-variable warnings; context reserved for future use
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function configExists(root: string): Promise<boolean> {
    const uri = vscode.Uri.file(path.join(root, '.architecture-leak.json'));
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

async function writeConfig(root: string, config: ArchConfig): Promise<void> {
    const content = JSON.stringify(config, null, 2) + '\n';
    const uri = vscode.Uri.file(path.join(root, '.architecture-leak.json'));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

function parsePaths(raw: string): string[] {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let n = '';
    for (let i = 0; i < 32; i++) { n += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return n;
}

// ---------------------------------------------------------------------------
// Wizard HTML
// ---------------------------------------------------------------------------

function getWizardHtml(dark: boolean): string {
    const nonce = getNonce();

    const bg     = dark ? '#1d2021' : '#fbf1c7';
    const bg1    = dark ? '#282828' : '#f2e5bc';
    const bg2    = dark ? '#3c3836' : '#ebdbb2';
    const fg     = dark ? '#ebdbb2' : '#3c3836';
    const fg2    = dark ? '#a89984' : '#7c6f64';
    const orange = dark ? '#fe8019' : '#d65d0e';
    const yellow = dark ? '#fabd2f' : '#b57614';
    const green  = dark ? '#b8bb26' : '#79740e';
    const red    = dark ? '#fb4934' : '#cc241d';
    const blue   = dark ? '#83a598' : '#076678';

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Config Wizard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: ${bg}; --bg1: ${bg1}; --bg2: ${bg2};
    --fg: ${fg}; --fg2: ${fg2};
    --orange: ${orange}; --yellow: ${yellow}; --green: ${green}; --red: ${red}; --blue: ${blue};
  }
  body {
    background: var(--bg); color: var(--fg);
    font-family: 'Segoe UI', system-ui, sans-serif;
    min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; padding: 2rem 1.5rem; gap: 1.5rem;
  }
  h1 { font-size: 1.1rem; color: var(--orange); letter-spacing: 0.04em; }
  .progress {
    display: flex; gap: 0.5rem; align-items: center;
    width: 100%; max-width: 560px;
  }
  .step-dot {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 700;
    border: 2px solid var(--bg2); color: var(--fg2);
    background: var(--bg1); flex-shrink: 0;
    transition: all 0.2s;
  }
  .step-dot.active { border-color: var(--orange); color: var(--orange); }
  .step-dot.done   { border-color: var(--green);  color: var(--bg); background: var(--green); }
  .step-line { flex: 1; height: 2px; background: var(--bg2); transition: background 0.2s; }
  .step-line.done { background: var(--green); }
  .card {
    background: var(--bg1); border: 1px solid var(--bg2);
    border-radius: 10px; padding: 1.6rem 2rem;
    width: 100%; max-width: 560px;
  }
  .card h2 { font-size: 0.95rem; color: var(--yellow); margin-bottom: 0.4rem; }
  .card p  { font-size: 0.82rem; color: var(--fg2); line-height: 1.55; margin-bottom: 1rem; }
  label { display: block; font-size: 0.8rem; color: var(--fg2); margin-bottom: 0.35rem; }
  input[type="text"], input[type="radio"] + label { }
  input[type="text"] {
    width: 100%; background: var(--bg2); color: var(--fg);
    border: 1px solid var(--bg2); border-radius: 6px;
    padding: 0.55rem 0.8rem; font-size: 0.875rem;
    outline: none; transition: border-color 0.15s;
  }
  input[type="text"]:focus { border-color: var(--orange); }
  .radio-group { display: flex; gap: 1rem; margin-top: 0.4rem; }
  .radio-opt {
    display: flex; align-items: center; gap: 0.45rem;
    cursor: pointer; font-size: 0.875rem; color: var(--fg);
  }
  input[type="radio"] { accent-color: var(--orange); width: 1rem; height: 1rem; }
  .error-msg { color: var(--red); font-size: 0.78rem; margin-top: 0.35rem; min-height: 1.1rem; }
  .hint { color: var(--blue); font-size: 0.75rem; margin-top: 0.4rem; }
  code { background: var(--bg2); color: var(--green); border-radius: 3px; padding: 0.1rem 0.3rem; font-size: 0.78rem; }
  .actions {
    display: flex; gap: 0.75rem; justify-content: flex-end;
    width: 100%; max-width: 560px;
  }
  button {
    cursor: pointer; border: none; border-radius: 6px;
    padding: 0.5rem 1.2rem; font-size: 0.875rem; font-weight: 600;
    transition: filter 0.15s, transform 0.1s;
  }
  button:hover  { filter: brightness(1.15); }
  button:active { transform: scale(0.97); }
  .btn-primary   { background: var(--orange); color: #1d2021; }
  .btn-secondary { background: var(--bg2);    color: var(--fg); }
  .btn-danger    { background: transparent; color: var(--red); border: 1px solid var(--red); }
  [hidden] { display: none !important; }
</style>
</head>
<body>

<h1>⬡ Architecture Leak — Config Wizard</h1>

<!-- Progress -->
<div class="progress" id="progress">
  <div class="step-dot active" id="dot0">1</div>
  <div class="step-line" id="line01"></div>
  <div class="step-dot" id="dot1">2</div>
  <div class="step-line" id="line12"></div>
  <div class="step-dot" id="dot2">3</div>
  <div class="step-line" id="line23"></div>
  <div class="step-dot" id="dot3">4</div>
</div>

<!-- Step 0: Tier 0 -->
<div class="card" id="step0">
  <h2>Tier 0 — Domain</h2>
  <p>The core business logic. Files in these directories <strong>cannot import</strong> from any other tier.</p>
  <label for="t0">Directory paths <span style="color:var(--fg2)">(comma-separated)</span></label>
  <input type="text" id="t0" placeholder="src/domain, pkg/entities"/>
  <div class="error-msg" id="t0-err"></div>
  <div class="hint">Example: <code>src/domain</code>, <code>pkg/entities</code>, <code>internal/core</code></div>
</div>

<!-- Step 1: Tier 1 -->
<div class="card" id="step1" hidden>
  <h2>Tier 1 — Application</h2>
  <p>Use cases &amp; orchestration. May only import from <strong>Tier 0</strong>.</p>
  <label for="t1">Directory paths <span style="color:var(--fg2)">(comma-separated)</span></label>
  <input type="text" id="t1" placeholder="src/application, pkg/usecases"/>
  <div class="error-msg" id="t1-err"></div>
  <div class="hint">Example: <code>src/application</code>, <code>pkg/usecases</code>, <code>internal/app</code></div>
</div>

<!-- Step 2: Tier 2 -->
<div class="card" id="step2" hidden>
  <h2>Tier 2 — Infrastructure</h2>
  <p>External adapters (DB, API, CLI). May import from <strong>Tier 0</strong> and <strong>Tier 1</strong>.</p>
  <label for="t2">Directory paths <span style="color:var(--fg2)">(comma-separated)</span></label>
  <input type="text" id="t2" placeholder="src/infrastructure, pkg/adapters"/>
  <div class="error-msg" id="t2-err"></div>
  <div class="hint">Example: <code>src/infrastructure</code>, <code>pkg/adapters</code>, <code>internal/infra</code></div>
</div>

<!-- Step 3: Options -->
<div class="card" id="step3" hidden>
  <h2>Options</h2>
  <p>Configure how violations are reported in the editor.</p>
  <label>Severity</label>
  <div class="radio-group">
    <label class="radio-opt">
      <input type="radio" name="severity" value="error" checked/> Error
    </label>
    <label class="radio-opt">
      <input type="radio" name="severity" value="warning"/> Warning
    </label>
  </div>
  <br/>
  <label for="excl">Exclude patterns <span style="color:var(--fg2)">(comma-separated globs, optional)</span></label>
  <input type="text" id="excl" placeholder="**/*_test.go, **/vendor/**, **/*.spec.ts"/>
  <div class="hint">Files matching these patterns are skipped during analysis.</div>
</div>

<div class="actions">
  <button class="btn-danger"     id="btn-cancel">Cancel</button>
  <button class="btn-secondary"  id="btn-back" hidden>← Back</button>
  <button class="btn-primary"    id="btn-next">Next →</button>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let step = 0;
  const TOTAL = 4;

  const steps = [
    document.getElementById('step0'),
    document.getElementById('step1'),
    document.getElementById('step2'),
    document.getElementById('step3'),
  ];
  const dots  = [0,1,2,3].map(i => document.getElementById('dot' + i));
  const lines = [
    document.getElementById('line01'),
    document.getElementById('line12'),
    document.getElementById('line23'),
  ];
  const btnNext   = document.getElementById('btn-next');
  const btnBack   = document.getElementById('btn-back');
  const btnCancel = document.getElementById('btn-cancel');

  function renderProgress() {
    dots.forEach((d, i) => {
      d.className = 'step-dot' + (i < step ? ' done' : i === step ? ' active' : '');
      d.textContent = i < step ? '✓' : String(i + 1);
    });
    lines.forEach((l, i) => {
      l.className = 'step-line' + (i < step ? ' done' : '');
    });
    btnBack.hidden = step === 0;
    btnNext.textContent = step === TOTAL - 1 ? '✔ Finish' : 'Next →';
  }

  function showStep(n) {
    steps.forEach((s, i) => s.hidden = i !== n);
    step = n;
    renderProgress();
    // Focus first input
    const input = steps[n]?.querySelector('input[type="text"]');
    if (input) input.focus();
  }

  function validate() {
    const errs = { t0: document.getElementById('t0-err'), t1: document.getElementById('t1-err'), t2: document.getElementById('t2-err') };
    const inputs = { t0: document.getElementById('t0'), t1: document.getElementById('t1'), t2: document.getElementById('t2') };
    if (step === 0) {
      if (!inputs.t0.value.trim()) { errs.t0.textContent = 'Required — enter at least one directory path.'; return false; }
      errs.t0.textContent = '';
    }
    if (step === 1) {
      if (!inputs.t1.value.trim()) { errs.t1.textContent = 'Required — enter at least one directory path.'; return false; }
      errs.t1.textContent = '';
    }
    if (step === 2) {
      if (!inputs.t2.value.trim()) { errs.t2.textContent = 'Required — enter at least one directory path.'; return false; }
      errs.t2.textContent = '';
    }
    return true;
  }

  function parsePaths(raw) {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  btnNext.addEventListener('click', () => {
    if (!validate()) return;
    if (step < TOTAL - 1) {
      showStep(step + 1);
    } else {
      // Finish
      const severity = document.querySelector('input[name="severity"]:checked').value;
      const excl = document.getElementById('excl').value;
      const config = {
        boundaries: {
          tier0: parsePaths(document.getElementById('t0').value),
          tier1: parsePaths(document.getElementById('t1').value),
          tier2: parsePaths(document.getElementById('t2').value),
        },
        options: {
          severity,
          exclude: parsePaths(excl),
        },
      };
      vscode.postMessage({ command: 'finish', config });
    }
  });

  btnBack.addEventListener('click', () => { if (step > 0) showStep(step - 1); });
  btnCancel.addEventListener('click', () => vscode.postMessage({ command: 'cancel' }));

  // Allow Enter to advance
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') btnNext.click();
  });

  renderProgress();
</script>
</body>
</html>`;
}
