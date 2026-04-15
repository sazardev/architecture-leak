use std::path::{Path, PathBuf};

use crate::config::{ArchConfig, Severity};

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tier {
    Domain = 0,
    Application = 1,
    Infrastructure = 2,
}

impl std::fmt::Display for Tier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Tier::Domain => write!(f, "Tier 0 (Domain)"),
            Tier::Application => write!(f, "Tier 1 (Application)"),
            Tier::Infrastructure => write!(f, "Tier 2 (Infrastructure)"),
        }
    }
}

// ---------------------------------------------------------------------------
// Violation
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub struct Violation {
    /// 0-based line number
    pub line: u32,
    pub message: String,
    pub severity: Severity,
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

/// Classify a workspace-relative file path against the configured tier patterns.
/// Returns `None` if the file does not belong to any configured tier.
pub fn classify_file(workspace_relative: &str, config: &ArchConfig) -> Option<Tier> {
    let norm = normalize(workspace_relative);

    for pattern in &config.boundaries.tier0 {
        if matches_tier_pattern(&norm, pattern) {
            return Some(Tier::Domain);
        }
    }
    for pattern in &config.boundaries.tier1 {
        if matches_tier_pattern(&norm, pattern) {
            return Some(Tier::Application);
        }
    }
    for pattern in &config.boundaries.tier2 {
        if matches_tier_pattern(&norm, pattern) {
            return Some(Tier::Infrastructure);
        }
    }
    None
}

/// Classify an import path. For relative TS/JS imports this resolves against
/// the file's directory. For Go/absolute paths it matches directly.
pub fn classify_import(
    import_path: &str,
    file_workspace_relative: &str,
    config: &ArchConfig,
) -> Option<Tier> {
    if import_path.starts_with('.') {
        // Relative import — resolve to workspace-relative path
        let file_dir = Path::new(file_workspace_relative)
            .parent()
            .unwrap_or(Path::new(""));
        let resolved = file_dir.join(import_path);
        let resolved_str = resolved.to_string_lossy();
        let norm = normalize(&resolved_str);
        classify_by_norm(&norm, config)
    } else if import_path.starts_with('/') {
        // Absolute path
        let norm = normalize(import_path);
        classify_by_norm(&norm, config)
    } else {
        // Module/package path (Go internal, path alias, etc.)
        // Match against any tier pattern that appears as a substring
        let norm = normalize(import_path);
        classify_by_norm_substring(&norm, config)
    }
}

/// Run a full violation check on a single file.
///
/// * `file_path`   – absolute filesystem path to the file
/// * `workspace_root` – absolute workspace root (used to derive workspace-relative path)
/// * `source`      – full file content
/// * `config`      – loaded config
///
/// Returns a list of violations (may be empty).
pub fn check_file(
    file_path: &Path,
    workspace_root: &Path,
    source: &str,
    config: &ArchConfig,
) -> Vec<Violation> {
    // Derive workspace-relative path
    let relative = match file_path.strip_prefix(workspace_root) {
        Ok(r) => r.to_string_lossy().replace('\\', "/"),
        Err(_) => file_path.to_string_lossy().replace('\\', "/"),
    };

    // Check exclusions
    for pat in &config.options.exclude {
        if glob_match(pat, &relative) {
            return vec![];
        }
    }

    // Classify the file itself
    let file_tier = match classify_file(&relative, config) {
        Some(t) => t,
        None => return vec![], // not in any tier — skip
    };

    // Parse imports depending on language
    let imports = parse_imports(file_path, source);

    let mut violations = Vec::new();

    for (line, import_path) in imports {
        // Skip obvious external / stdlib imports that can never be in-project
        if is_external_import(&import_path, file_path) {
            continue;
        }

        if let Some(import_tier) = classify_import(&import_path, &relative, config) {
            if let Some(msg) = violation_message(file_tier, import_tier) {
                violations.push(Violation {
                    line,
                    message: msg,
                    severity: config.options.severity.clone(),
                });
            }
        }
    }

    violations
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn violation_message(from: Tier, to: Tier) -> Option<String> {
    match (from, to) {
        (Tier::Domain, Tier::Application) | (Tier::Domain, Tier::Infrastructure) => Some(format!(
            "Architecture violation: {} cannot import from {}. \
             Domain must be completely isolated from outer tiers.",
            from, to
        )),
        (Tier::Application, Tier::Infrastructure) => Some(format!(
            "Architecture violation: {} cannot import from {}. \
             Application layer must only depend on Domain (Tier 0).",
            from, to
        )),
        _ => None,
    }
}

fn matches_tier_pattern(normalized_path: &str, pattern: &str) -> bool {
    let norm_pattern = normalize(pattern);
    // The file is in this tier if its path starts with the tier pattern prefix
    normalized_path == norm_pattern
        || normalized_path.starts_with(&format!("{}/", norm_pattern))
}

fn normalize(p: &str) -> String {
    // Normalise separators, strip leading ./ and trailing slashes, collapse ..
    let p = p.replace('\\', "/");
    let p = p.trim_start_matches("./").trim_end_matches('/');

    // Resolve .. components (simple, non-symlink)
    let mut parts: Vec<&str> = Vec::new();
    for seg in p.split('/') {
        match seg {
            "" | "." => {}
            ".." => { parts.pop(); }
            s => parts.push(s),
        }
    }
    parts.join("/")
}

fn classify_by_norm(norm: &str, config: &ArchConfig) -> Option<Tier> {
    for pattern in &config.boundaries.tier0 {
        if matches_tier_pattern(norm, pattern) { return Some(Tier::Domain); }
    }
    for pattern in &config.boundaries.tier1 {
        if matches_tier_pattern(norm, pattern) { return Some(Tier::Application); }
    }
    for pattern in &config.boundaries.tier2 {
        if matches_tier_pattern(norm, pattern) { return Some(Tier::Infrastructure); }
    }
    None
}

/// For non-relative imports: check if the path *contains* a tier pattern as
/// a path segment (useful for Go module paths like `project/internal/domain/…`).
fn classify_by_norm_substring(norm: &str, config: &ArchConfig) -> Option<Tier> {
    let check = |patterns: &[String]| -> bool {
        patterns.iter().any(|p| {
            let np = normalize(p);
            norm == np
                || norm.contains(&format!("/{}/", np))
                || norm.ends_with(&format!("/{}", np))
                || norm.starts_with(&format!("{}/", np))
        })
    };
    if check(&config.boundaries.tier0) { return Some(Tier::Domain); }
    if check(&config.boundaries.tier1) { return Some(Tier::Application); }
    if check(&config.boundaries.tier2) { return Some(Tier::Infrastructure); }
    None
}

fn parse_imports(file_path: &Path, source: &str) -> Vec<(u32, String)> {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    match ext {
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" => {
            crate::parser::typescript::extract_imports(source)
        }
        "go" => crate::parser::golang::extract_imports(source),
        _ => vec![],
    }
}

fn is_external_import(import_path: &str, file_path: &Path) -> bool {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    match ext {
        // TS/JS: external if it doesn't start with . or /  AND isn't a path alias
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" => {
            !import_path.starts_with('.')
                && !import_path.starts_with('/')
                && !import_path.starts_with('@')
        }
        // Go: external if it has fewer than 2 path segments (stdlib single-word)
        "go" => {
            !import_path.contains('/') // e.g. "fmt", "os", "sync"
        }
        _ => true,
    }
}

/// Very small glob matcher supporting only `**` and `*`.
fn glob_match(pattern: &str, path: &str) -> bool {
    glob_match_inner(pattern, path)
}

fn glob_match_inner(pattern: &str, path: &str) -> bool {
    if pattern.is_empty() {
        return path.is_empty();
    }
    if pattern == "**" {
        return true;
    }

    if let Some(rest_pat) = pattern.strip_prefix("**/") {
        // Match zero or more path segments
        if glob_match_inner(rest_pat, path) {
            return true;
        }
        // Try consuming a segment from path
        if let Some(slash) = path.find('/') {
            return glob_match_inner(pattern, &path[slash + 1..]);
        }
        return false;
    }

    // Split on first segment of pattern
    let (pat_seg, pat_rest) = match pattern.find('/') {
        Some(i) => (&pattern[..i], &pattern[i + 1..]),
        None => (pattern, ""),
    };
    let (path_seg, path_rest) = match path.find('/') {
        Some(i) => (&path[..i], &path[i + 1..]),
        None => (path, ""),
    };

    if segment_matches(pat_seg, path_seg) {
        if pat_rest.is_empty() {
            return path_rest.is_empty();
        }
        return glob_match_inner(pat_rest, path_rest);
    }
    false
}

fn segment_matches(pattern: &str, s: &str) -> bool {
    let mut pi = pattern.chars().peekable();
    let mut si = s.chars().peekable();
    loop {
        match (pi.peek(), si.peek()) {
            (None, None) => return true,
            (Some('*'), _) => {
                pi.next();
                if pi.peek().is_none() { return true; }
                // Try to match rest from each position in s
                let rest_pat: String = pi.collect();
                let rest_s: String = si.collect();
                for i in 0..=rest_s.len() {
                    if segment_matches(&rest_pat, &rest_s[i..]) { return true; }
                }
                return false;
            }
            (Some(_), None) | (None, Some(_)) => return false,
            (Some(p), Some(s_c)) => {
                if *p != *s_c { return false; }
                pi.next(); si.next();
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Resolve workspace-relative from an absolute path + root
// ---------------------------------------------------------------------------

#[allow(dead_code)]
pub fn workspace_relative(abs_path: &Path, workspace_root: &Path) -> PathBuf {
    abs_path
        .strip_prefix(workspace_root)
        .unwrap_or(abs_path)
        .to_path_buf()
}
