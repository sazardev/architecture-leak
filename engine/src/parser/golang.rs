use once_cell::sync::Lazy;
use regex::Regex;

// Single import: import "path"  or  import alias "path"
static RE_SINGLE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?m)^\s*import\s+(?:\w+\s+)?"([^"]+)""#).unwrap()
});

// Import block opener
static RE_BLOCK_OPEN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^\s*import\s*\(").unwrap()
});

// One path inside a block: optional alias then "path"
static RE_BLOCK_LINE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"^\s*(?:\w+\s+)?"([^"]+)""#).unwrap()
});

/// Returns a list of (line_number_0based, import_path) for every Go import
/// found in `source`.
pub fn extract_imports(source: &str) -> Vec<(u32, String)> {
    let mut out: Vec<(u32, String)> = Vec::new();

    // Single-line imports
    for cap in RE_SINGLE.captures_iter(source) {
        if let Some(m) = cap.get(1) {
            let line = line_of(source, m.start());
            out.push((line, m.as_str().to_string()));
        }
    }

    // Block imports: find `import (`, collect lines until `)`
    let mut search_start = 0;
    while let Some(open_m) = RE_BLOCK_OPEN.find(&source[search_start..]) {
        let abs_open = search_start + open_m.end();
        let block_start_line = line_of(source, abs_open);

        // Find matching `)`
        if let Some(rel_close) = source[abs_open..].find(')') {
            let block_text = &source[abs_open..abs_open + rel_close];
            for (i, line) in block_text.lines().enumerate() {
                if let Some(cap) = RE_BLOCK_LINE.captures(line) {
                    if let Some(m) = cap.get(1) {
                        out.push((block_start_line + i as u32, m.as_str().to_string()));
                    }
                }
            }
            search_start = abs_open + rel_close + 1;
        } else {
            break;
        }
    }

    out.sort_by_key(|(l, _)| *l);
    out.dedup_by_key(|(_, p)| p.clone());
    out
}

fn line_of(source: &str, byte_offset: usize) -> u32 {
    source[..byte_offset].chars().filter(|&c| c == '\n').count() as u32
}
