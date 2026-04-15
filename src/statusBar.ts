import * as vscode from 'vscode';

export class StatusBarController {
    private item: vscode.StatusBarItem | undefined;

    init(context: vscode.ExtensionContext): void {
        this.item = vscode.window.createStatusBarItem(
            'architecture-leak.status',
            vscode.StatusBarAlignment.Left,
            100,
        );
        this.item.name = 'Architecture Leak';
        this.item.command = 'architecture-leak.showViolationsReport';
        this.item.tooltip = 'Architecture Leak — click to show Problems panel';
        this.setLoading();
        this.item.show();
        context.subscriptions.push(this.item);
    }

    setOk(violationCount: number = 0): void {
        if (!this.item) { return; }
        if (violationCount === 0) {
            this.item.text = '$(pass) arch: clean';
            this.item.backgroundColor = undefined;
            this.item.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
            this.item.tooltip = 'Architecture Leak — no violations detected';
        } else {
            this.item.text = `$(warning) arch: ${violationCount} violation${violationCount === 1 ? '' : 's'}`;
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
            this.item.tooltip = `Architecture Leak — ${violationCount} boundary violation${violationCount === 1 ? '' : 's'} detected. Click to view.`;
        }
    }

    setLoading(): void {
        if (!this.item) { return; }
        this.item.text = '$(loading~spin) arch: starting…';
        this.item.backgroundColor = undefined;
        this.item.color = undefined;
        this.item.tooltip = 'Architecture Leak — engine starting…';
    }

    setError(message: string): void {
        if (!this.item) { return; }
        this.item.text = '$(error) arch: offline';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
        this.item.tooltip = `Architecture Leak — ${message}`;
    }

    setDisabled(): void {
        if (!this.item) { return; }
        this.item.text = '$(circle-slash) arch: disabled';
        this.item.backgroundColor = undefined;
        this.item.color = new vscode.ThemeColor('statusBarItem.foreground');
        this.item.tooltip = 'Architecture Leak — disabled in settings';
    }

    dispose(): void {
        this.item?.dispose();
        this.item = undefined;
    }
}
