use crate::shared::link_parser::ParsedInternalLink;
use crate::shared::markdown_doc::ParseDiagnostic;
use std::collections::BTreeMap;

fn make_link(target_path: &str, line: usize) -> ParsedInternalLink {
    ParsedInternalLink {
        target_path: target_path.to_string(),
        anchor: None,
        line,
    }
}

fn run_link_validation(
    note_path: &str,
    links: Vec<ParsedInternalLink>,
    cache_paths: &[&str],
) -> Vec<ParseDiagnostic> {
    let mut notes_cache: BTreeMap<String, ()> = BTreeMap::new();
    for p in cache_paths {
        notes_cache.insert(p.to_string(), ());
    }

    let mut diagnostics: Vec<ParseDiagnostic> = vec![];
    for link in &links {
        if link.target_path.is_empty() || link.target_path == note_path {
            continue;
        }
        if !notes_cache.contains_key(&link.target_path) {
            diagnostics.push(ParseDiagnostic {
                line: link.line as u32,
                column: 0,
                end_line: link.line as u32,
                end_column: 0,
                severity: "warning".to_string(),
                message: format!("Unresolved link: {}", link.target_path),
                rule_id: Some("link/unresolved".to_string()),
            });
        }
    }
    diagnostics
}

#[test]
fn resolved_link_produces_no_diagnostic() {
    let diags = run_link_validation(
        "notes/a.md",
        vec![make_link("notes/b.md", 3)],
        &["notes/a.md", "notes/b.md"],
    );
    assert!(diags.is_empty());
}

#[test]
fn unresolved_link_produces_warning() {
    let diags = run_link_validation(
        "notes/a.md",
        vec![make_link("notes/missing.md", 5)],
        &["notes/a.md"],
    );
    assert_eq!(diags.len(), 1);
    assert_eq!(diags[0].severity, "warning");
    assert_eq!(diags[0].rule_id.as_deref(), Some("link/unresolved"));
    assert_eq!(diags[0].message, "Unresolved link: notes/missing.md");
    assert_eq!(diags[0].line, 5);
}

#[test]
fn self_link_produces_no_diagnostic() {
    let diags = run_link_validation(
        "notes/a.md",
        vec![make_link("notes/a.md", 2)],
        &["notes/a.md"],
    );
    assert!(diags.is_empty());
}

#[test]
fn mixed_links_only_unresolved_get_diagnostics() {
    let diags = run_link_validation(
        "notes/a.md",
        vec![
            make_link("notes/b.md", 1),
            make_link("notes/missing.md", 7),
            make_link("notes/c.md", 10),
            make_link("notes/also_missing.md", 15),
        ],
        &["notes/a.md", "notes/b.md", "notes/c.md"],
    );
    assert_eq!(diags.len(), 2);
    assert!(diags.iter().all(|d| d.severity == "warning"));
    assert!(diags
        .iter()
        .any(|d| d.message == "Unresolved link: notes/missing.md"));
    assert!(diags
        .iter()
        .any(|d| d.message == "Unresolved link: notes/also_missing.md"));
}

#[test]
fn empty_target_path_produces_no_diagnostic() {
    let diags = run_link_validation("notes/a.md", vec![make_link("", 4)], &["notes/a.md"]);
    assert!(diags.is_empty());
}
