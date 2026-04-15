use serde::Deserialize;
use std::path::Path;

// ---------------------------------------------------------------------------
// Schema mirrors .architecture-leak.json
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct Boundaries {
    pub tier0: Vec<String>,
    pub tier1: Vec<String>,
    pub tier2: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Options {
    #[serde(default = "default_severity")]
    pub severity: Severity,
    #[serde(default)]
    pub exclude: Vec<String>,
}

fn default_severity() -> Severity {
    Severity::Error
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ArchConfig {
    pub boundaries: Boundaries,
    #[serde(default = "default_options")]
    pub options: Options,
}

fn default_options() -> Options {
    Options {
        severity: Severity::Error,
        exclude: vec![],
    }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/// Searches for `.architecture-leak.json` starting from `start` and walking
/// upwards toward the filesystem root. Returns the first config found.
#[allow(dead_code)]
pub fn find_and_load(start: &Path) -> Option<ArchConfig> {
    let mut current = start.to_path_buf();
    loop {
        let candidate = current.join(".architecture-leak.json");
        if candidate.exists() {
            return load_file(&candidate);
        }
        if !current.pop() {
            break;
        }
    }
    None
}

/// Load a config from an explicit path.
pub fn load(workspace_root: &Path) -> Option<ArchConfig> {
    let path = workspace_root.join(".architecture-leak.json");
    if path.exists() {
        load_file(&path)
    } else {
        None
    }
}

/// Walk up from `start` looking for `.architecture-leak.json`.
/// Returns `(config_dir, config)` so the caller knows the effective workspace root.
pub fn find_and_load_with_root(start: &Path) -> Option<(std::path::PathBuf, ArchConfig)> {
    let mut current = start.to_path_buf();
    loop {
        let candidate = current.join(".architecture-leak.json");
        if candidate.exists() {
            if let Some(cfg) = load_file(&candidate) {
                return Some((current, cfg));
            }
        }
        if !current.pop() {
            break;
        }
    }
    None
}

fn load_file(path: &Path) -> Option<ArchConfig> {
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<ArchConfig>(&content).ok()
}
