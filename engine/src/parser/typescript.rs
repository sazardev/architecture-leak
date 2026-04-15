use once_cell::sync::Lazy;
use regex::Regex;

// Matches: import ... from 'path'  /  import ... from "path"
static RE_FROM: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?m)\bfrom\s+['"]([^'"]+)['"]"#).unwrap()
});

// Matches: require('path') / require("path")
static RE_REQUIRE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap()
});

// Matches: import('path') / import("path")  (dynamic imports)
static RE_DYNAMIC: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap()
});

/// Returns a list of (line_number_0based, import_path) for every import
/// found in `source`. Only captures string-literal paths — skips `import type`
/// assertions, template literals, etc.
pub fn extract_imports(source: &str) -> Vec<(u32, String)> {
    let mut out: Vec<(u32, String)> = Vec::new();

    for cap in RE_FROM.captures_iter(source) {
        if let Some(path_match) = cap.get(1) {
            let line = line_of(source, path_match.start());
            out.push((line, path_match.as_str().to_string()));
        }
    }

    for cap in RE_REQUIRE.captures_iter(source) {
        if let Some(path_match) = cap.get(1) {
            let line = line_of(source, path_match.start());
            out.push((line, path_match.as_str().to_string()));
        }
    }

    for cap in RE_DYNAMIC.captures_iter(source) {
        if let Some(path_match) = cap.get(1) {
            let line = line_of(source, path_match.start());
            out.push((line, path_match.as_str().to_string()));
        }
    }

    out.sort_by_key(|(l, _)| *l);
    out.dedup_by_key(|(_, p)| p.clone());
    out
}

fn line_of(source: &str, byte_offset: usize) -> u32 {
    source[..byte_offset].chars().filter(|&c| c == '\n').count() as u32
}
