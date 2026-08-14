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

/// `inline_edit_policy()` in agent_run_policy.ts names two tools as strings;
/// nothing else checks that they exist. Both dispatch paths now narrow through
/// the same `selector_allows`, so the old scoped-vs-native parity assertion
/// could no longer fail — this is the half of it that still can.
#[test]
fn inline_edit_surface_scope_resolves_against_the_real_catalog() {
    use crate::features::ai::agent_stream::ToolSelector;
    use crate::features::ai::native_agent::allowed_tools;

    let catalog = McpRouter::new().tool_definitions_public();
    let inline_edit = ToolSelector::Only {
        names: vec!["read_note".to_string(), "search_notes".to_string()],
    };

    let allowed: BTreeSet<String> = allowed_tools(&catalog, &inline_edit)
        .into_iter()
        .map(|tool| tool.name)
        .collect();

    assert_eq!(
        allowed,
        BTreeSet::from(["read_note".to_string(), "search_notes".to_string()]),
        "INLINE EDIT SCOPE DRIFT — agent_run_policy.ts names these two tools \
         verbatim; a rename in the Rust catalog silently narrows inline edit \
         to nothing."
    );
}
