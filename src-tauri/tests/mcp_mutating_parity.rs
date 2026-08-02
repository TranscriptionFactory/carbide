use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use crate::features::mcp::router::McpRouter;

fn agent_file_ops_source() -> String {
    let ts_path: PathBuf = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("src/lib/features/assistant/domain/agent_file_ops.ts");
    fs::read_to_string(&ts_path)
        .unwrap_or_else(|e| panic!("cannot read TS source at {}: {}", ts_path.display(), e))
}

/// String literals of the array/set literal that follows `marker`. Tolerates
/// prettier collapsing the list onto one line or exploding it over many.
fn ts_string_list(src: &str, marker: &str) -> BTreeSet<String> {
    let start = src
        .find(marker)
        .unwrap_or_else(|| panic!("`{marker}` not found in agent_file_ops.ts"));
    let rest = &src[start + marker.len()..];
    let end = rest
        .find(']')
        .unwrap_or_else(|| panic!("unterminated literal after `{marker}`"));

    let entries: BTreeSet<String> = rest[..end]
        .split('"')
        .skip(1)
        .step_by(2)
        .map(str::to_string)
        .collect();

    assert!(
        !entries.is_empty(),
        "parsed zero entries from `{marker}` — the scraper is out of sync with the TS file format"
    );
    entries
}

fn ts_mutating_tools() -> BTreeSet<String> {
    ts_string_list(&agent_file_ops_source(), "MUTATING_MCP_TOOLS = new Set([")
}

fn ts_path_keys() -> BTreeSet<String> {
    ts_string_list(&agent_file_ops_source(), "PATH_KEYS = [")
}

fn rust_mutating_tools() -> BTreeSet<String> {
    McpRouter::new()
        .tool_definitions_public()
        .into_iter()
        .filter(|d| d.mutating)
        .map(|d| d.name)
        .collect()
}

#[test]
fn mutating_tool_parity_rust_vs_typescript() {
    let rust_set = rust_mutating_tools();
    let ts_set = ts_mutating_tools();

    let in_rust_not_ts: Vec<_> = rust_set.difference(&ts_set).collect();
    let in_ts_not_rust: Vec<_> = ts_set.difference(&rust_set).collect();

    if !in_rust_not_ts.is_empty() || !in_ts_not_rust.is_empty() {
        panic!(
            "MUTATING TOOLS PARITY MISMATCH — update BOTH sides to keep them in sync:\n\
             Rust ToolDefinition.mutating (source of truth for native safe-mode) ↔ \
             TS MUTATING_MCP_TOOLS (drives changed-file tracking in agent_file_ops.ts)\n\n\
             In Rust but NOT in TS:  {in_rust_not_ts:?}\n\
             In TS but NOT in Rust:  {in_ts_not_rust:?}\n\n\
             Fix: add/remove the tool name in whichever side is missing it.\n\
             Rust: set `mutating: true/false` in the tool definition.\n\
             TS:   add/remove the string in MUTATING_MCP_TOOLS in agent_file_ops.ts."
        );
    }
}

// The TS list is the fallback used whenever structured `paths` are absent from
// a ToolStart event; a key present only in Rust silently drops that path.
#[test]
fn tool_path_key_parity_rust_vs_typescript() {
    use crate::features::ai::tool_paths::PATH_KEYS;

    let rust_set: BTreeSet<String> = PATH_KEYS.iter().map(|k| k.to_string()).collect();
    let ts_set = ts_path_keys();

    assert_eq!(
        rust_set, ts_set,
        "TOOL PATH KEY PARITY MISMATCH — update BOTH sides to keep them in sync:\n\
         Rust PATH_KEYS (ai/tool_paths.rs, extracts paths before truncation) ↔ \
         TS PATH_KEYS (agent_file_ops.ts, parses paths back out of input_summary)\n\
         A key missing from TS means that path is dropped whenever the structured \
         `paths` field is empty."
    );
}

#[test]
fn safe_mode_read_only_parity_harness_vs_native() {
    use crate::features::ai::agent_stream::ToolSelector;
    use crate::features::ai::harness::{selector_allow_list, MCP_TOOL_PREFIX};
    use crate::features::ai::native_agent::allowed_tools;

    let catalog = McpRouter::new().tool_definitions_public();

    let harness: BTreeSet<String> = selector_allow_list(&ToolSelector::ReadOnly, &catalog)
        .expect("ReadOnly must yield an explicit allow-list")
        .into_iter()
        .map(|name| {
            name.strip_prefix(MCP_TOOL_PREFIX)
                .unwrap_or(&name)
                .to_string()
        })
        .collect();

    let native: BTreeSet<String> = allowed_tools(&catalog, &ToolSelector::ReadOnly)
        .into_iter()
        .map(|tool| tool.name)
        .collect();

    assert!(
        !harness.is_empty(),
        "read-only set is empty — the real catalog should expose non-mutating tools"
    );
    assert_eq!(
        harness, native,
        "SAFE-MODE BARRIER DRIFT — the harness read-only allow-list and the native \
         read-only toolset must expose the SAME tools when built from the real catalog.\n\
         Both filter on ToolDefinition.mutating; keep the two filters in sync."
    );
}
