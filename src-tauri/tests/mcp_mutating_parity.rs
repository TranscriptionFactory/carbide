use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use crate::features::mcp::router::McpRouter;

fn ts_mutating_tools() -> BTreeSet<String> {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let ts_path: PathBuf = PathBuf::from(manifest_dir)
        .join("..")
        .join("src/lib/features/rag/domain/agent_file_ops.ts");

    let src = fs::read_to_string(&ts_path).unwrap_or_else(|e| {
        panic!(
            "cannot read TS source at {}: {}",
            ts_path.display(),
            e
        )
    });

    let mut in_set = false;
    let mut tools = BTreeSet::new();

    for line in src.lines() {
        if line.contains("MUTATING_MCP_TOOLS = new Set([") {
            in_set = true;
            continue;
        }
        if in_set {
            if line.contains("]);") {
                break;
            }
            let trimmed = line.trim().trim_end_matches(',');
            let cleaned = trimmed
                .trim_start_matches('"')
                .trim_end_matches('"')
                .trim_start_matches('\'')
                .trim_end_matches('\'');
            if !cleaned.is_empty() {
                tools.insert(cleaned.to_string());
            }
        }
    }

    assert!(
        !tools.is_empty(),
        "parsed zero entries from MUTATING_MCP_TOOLS — the line-based parser may be out of sync with the TS file format"
    );
    tools
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
