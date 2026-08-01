use serde_json::Value;

pub const PATH_KEYS: [&str; 5] = [
    "file_path",
    "path",
    "old_path",
    "new_path",
    "notebook_path",
];

// Tool inputs that carry per-item paths rather than a top-level one:
// MultiEdit-style `edits`, codex `file_change` `changes`.
const NESTED_KEYS: [&str; 2] = ["edits", "changes"];

/// Paths a tool call touches, read from the *untruncated* input. The frontend
/// cannot recover these from `input_summary`: serde emits object keys
/// alphabetically, so `content` precedes `file_path` and the path falls outside
/// the summary's character budget.
pub fn extract_tool_paths(input: &Value) -> Vec<String> {
    let mut paths = Vec::new();
    collect_paths(input, &mut paths);
    paths
}

fn collect_paths(input: &Value, out: &mut Vec<String>) {
    let Some(object) = input.as_object() else {
        return;
    };
    for key in PATH_KEYS {
        push_path(object.get(key), out);
    }
    for key in NESTED_KEYS {
        let Some(items) = object.get(key).and_then(Value::as_array) else {
            continue;
        };
        for item in items {
            collect_paths(item, out);
        }
    }
}

fn push_path(value: Option<&Value>, out: &mut Vec<String>) {
    let Some(path) = value.and_then(Value::as_str) else {
        return;
    };
    if path.is_empty() || out.iter().any(|seen| seen == path) {
        return;
    }
    out.push(path.to_string());
}
