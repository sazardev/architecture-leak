use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::Mutex;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};

mod analyzer;
mod config;
mod parser;

use config::ArchConfig;

// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------

#[derive(Default)]
struct State {
    workspace_root: Option<PathBuf>,
    config: Option<ArchConfig>,
}

struct Backend {
    client: Client,
    state: Arc<Mutex<State>>,
}

// ---------------------------------------------------------------------------
// LSP implementation
// ---------------------------------------------------------------------------

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, params: InitializeParams) -> Result<InitializeResult> {
        // Determine workspace root
        let root: Option<PathBuf> = params
            .root_uri
            .as_ref()
            .and_then(|u| u.to_file_path().ok())
            .or_else(|| {
                params
                    .workspace_folders
                    .as_ref()?
                    .first()
                    .and_then(|wf| wf.uri.to_file_path().ok())
            });

        let mut state = self.state.lock().await;
        state.workspace_root = root.clone();
        if let Some(ref r) = root {
            state.config = config::load(r);
        }

        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Options(
                    TextDocumentSyncOptions {
                        open_close: Some(true),
                        change: Some(TextDocumentSyncKind::FULL),
                        save: Some(TextDocumentSyncSaveOptions::SaveOptions(SaveOptions {
                            include_text: Some(false),
                        })),
                        ..Default::default()
                    },
                )),
                ..Default::default()
            },
            server_info: Some(ServerInfo {
                name: "architecture-leak".to_string(),
                version: Some(env!("CARGO_PKG_VERSION").to_string()),
            }),
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(
                MessageType::INFO,
                "⬡ Architecture Leak engine ready.",
            )
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let uri = params.text_document.uri;
        let text = params.text_document.text;
        self.analyze_and_publish(&uri, &text).await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        if let Some(change) = params.content_changes.last() {
            self.analyze_and_publish(&params.text_document.uri, &change.text)
                .await;
        }
    }

    async fn did_save(&self, params: DidSaveTextDocumentParams) {
        // If the config file itself was saved, reload it
        let path = match params.text_document.uri.to_file_path() {
            Ok(p) => p,
            Err(_) => return,
        };

        if path
            .file_name()
            .map(|n| n == ".architecture-leak.json")
            .unwrap_or(false)
        {
            let mut state = self.state.lock().await;
            if let Some(ref root) = state.workspace_root.clone() {
                state.config = config::load(root);
                self.client
                    .log_message(MessageType::INFO, "Architecture Leak: config reloaded.")
                    .await;
            }
        }
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        // Clear diagnostics when a file is closed
        self.client
            .publish_diagnostics(params.text_document.uri, vec![], None)
            .await;
    }
}

// ---------------------------------------------------------------------------
// Analysis helper
// ---------------------------------------------------------------------------

impl Backend {
    async fn analyze_and_publish(&self, uri: &Url, source: &str) {
        let file_path = match uri.to_file_path() {
            Ok(p) => p,
            Err(_) => return,
        };

        // Resolve workspace root + config:
        // 1. Try the workspace-level config (set at initialize time).
        // 2. If not available, walk up from the opened file's directory.
        //    This handles cases where VS Code's workspace root differs from
        //    the project root that contains .architecture-leak.json.
        let state = self.state.lock().await;
        let ws_root = state.workspace_root.clone();
        let ws_cfg = state.config.clone();
        drop(state);

        let (root, cfg) = if let (Some(r), Some(c)) = (ws_root, ws_cfg) {
            (r, c)
        } else {
            let file_dir = file_path.parent().unwrap_or(&file_path);
            match config::find_and_load_with_root(file_dir) {
                Some(pair) => pair,
                None => {
                    self.client
                        .publish_diagnostics(uri.clone(), vec![], None)
                        .await;
                    return;
                }
            }
        };

        let violations = analyzer::check_file(&file_path, &root, source, &cfg);

        let diagnostics: Vec<Diagnostic> = violations
            .into_iter()
            .map(|v| {
                let severity = match v.severity {
                    config::Severity::Error => DiagnosticSeverity::ERROR,
                    config::Severity::Warning => DiagnosticSeverity::WARNING,
                };
                Diagnostic {
                    range: Range {
                        start: Position { line: v.line, character: 0 },
                        end: Position {
                            line: v.line,
                            character: u32::MAX,
                        },
                    },
                    severity: Some(severity),
                    source: Some("architecture-leak".to_string()),
                    message: v.message,
                    ..Default::default()
                }
            })
            .collect();

        self.client
            .publish_diagnostics(uri.clone(), diagnostics, None)
            .await;
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let state = Arc::new(Mutex::new(State::default()));
    let (service, socket) = LspService::new(|client| Backend {
        client,
        state: Arc::clone(&state),
    });

    Server::new(stdin, stdout, socket).serve(service).await;
}
