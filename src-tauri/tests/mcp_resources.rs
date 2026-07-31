use std::fs;
use std::path::{Path, PathBuf};

use crate::features::mcp::resources::{
    guide_definitions, guide_uri, parse_uri, plugin_definitions, plugin_help_text, plugin_help_uri,
    read_guide, resolve_docs_dir, ResourceError, ResourceUri, GUIDES,
};
use crate::features::plugin::types::PluginInfo;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has a parent")
        .to_path_buf()
}

fn plugin_info(dir: &Path, manifest_json: &str) -> PluginInfo {
    PluginInfo {
        manifest: serde_json::from_str(manifest_json).expect("manifest fixture parses"),
        path: dir.to_string_lossy().into_owned(),
        source: "user".into(),
    }
}

const MINIMAL_MANIFEST: &str = r#"{
  "id": "demo",
  "name": "Demo Plugin",
  "version": "1.2.3",
  "author": "Carbide",
  "description": "Does demo things.",
  "api_version": "1",
  "permissions": ["fs:read"]
}"#;

// --- URI grammar ---

#[test]
fn guide_uri_round_trips_through_parse() {
    let uri = guide_uri("getting_started");
    assert_eq!(uri, "carbide://help/getting_started");
    assert_eq!(
        parse_uri(&uri),
        Some(ResourceUri::Guide("getting_started".into()))
    );
}

#[test]
fn plugin_help_uri_round_trips_through_parse() {
    let uri = plugin_help_uri("smart-templates");
    assert_eq!(uri, "carbide://plugin/smart-templates/help");
    assert_eq!(
        parse_uri(&uri),
        Some(ResourceUri::PluginHelp("smart-templates".into()))
    );
}

#[test]
fn parse_uri_rejects_malformed_and_traversing_uris() {
    for uri in [
        "carbide://help/",
        "carbide://help/../secrets",
        "carbide://help/nested/slug",
        "carbide://plugin/demo",
        "carbide://plugin//help",
        "carbide://plugin/../../help",
        "file:///etc/passwd",
        "carbide://unknown/thing",
    ] {
        assert!(parse_uri(uri).is_none(), "expected {uri} to be rejected");
    }
}

// --- Guide corpus ---

#[test]
fn guide_definitions_expose_every_guide_as_markdown() {
    let definitions = guide_definitions();
    assert_eq!(definitions.len(), GUIDES.len());
    for (definition, guide) in definitions.iter().zip(GUIDES) {
        assert_eq!(definition.uri, guide_uri(guide.slug));
        assert_eq!(definition.name, guide.title);
        assert_eq!(definition.description.as_deref(), Some(guide.description));
        assert_eq!(definition.mime_type.as_deref(), Some("text/markdown"));
    }
}

#[test]
fn every_guide_slug_resolves_to_a_bundled_docs_file() {
    let docs = repo_root().join("docs");
    for guide in GUIDES {
        let path = docs.join(format!("{}.md", guide.slug));
        assert!(
            path.is_file(),
            "guide `{}` has no docs file at {}",
            guide.slug,
            path.display()
        );
    }
}

#[test]
fn guide_slugs_match_the_frontend_help_dialog() {
    let help_data = fs::read_to_string(
        repo_root().join("src/lib/app/orchestration/help_data.ts"),
    )
    .expect("help_data.ts is readable");

    let slug_pattern = regex::Regex::new(r#"slug:\s*"([^"]+)""#).expect("valid pattern");
    let frontend_slugs: Vec<&str> = slug_pattern
        .captures_iter(&help_data)
        .map(|c| c.get(1).expect("capture group").as_str())
        .collect();
    let rust_slugs: Vec<&str> = GUIDES.iter().map(|g| g.slug).collect();

    assert_eq!(
        rust_slugs, frontend_slugs,
        "MCP help guides drifted from help_data.ts GUIDES"
    );
}

#[test]
fn read_guide_returns_markdown_from_the_docs_dir() {
    let dir = tempfile::tempdir().expect("tempdir");
    fs::write(dir.path().join("getting_started.md"), "# Hello\n").expect("write");

    let text = read_guide(dir.path(), "getting_started").expect("guide reads");
    assert_eq!(text, "# Hello\n");
}

#[test]
fn read_guide_rejects_slugs_outside_the_curated_list() {
    let dir = tempfile::tempdir().expect("tempdir");
    fs::write(dir.path().join("secrets.md"), "nope").expect("write");

    for slug in ["secrets", "../secrets", "getting_started/../secrets"] {
        assert!(
            matches!(read_guide(dir.path(), slug), Err(ResourceError::NotFound(_))),
            "expected slug `{slug}` to be rejected"
        );
    }
}

#[test]
fn read_guide_reports_missing_files_as_internal_errors() {
    let dir = tempfile::tempdir().expect("tempdir");
    assert!(matches!(
        read_guide(dir.path(), "getting_started"),
        Err(ResourceError::Internal(_))
    ));
}

#[test]
fn resolve_docs_dir_probes_packaged_and_dev_layouts() {
    let packaged = tempfile::tempdir().expect("tempdir");
    fs::create_dir_all(packaged.path().join("_up_/docs")).expect("mkdir");
    assert_eq!(
        resolve_docs_dir(packaged.path()),
        Some(packaged.path().join("_up_/docs"))
    );

    let dev = tempfile::tempdir().expect("tempdir");
    fs::create_dir_all(dev.path().join("docs")).expect("mkdir");
    assert_eq!(resolve_docs_dir(dev.path()), Some(dev.path().join("docs")));

    let empty = tempfile::tempdir().expect("tempdir");
    assert_eq!(resolve_docs_dir(empty.path()), None);
}

// --- Plugin help ---

#[test]
fn plugin_help_text_prefers_the_readme_convention() {
    let dir = tempfile::tempdir().expect("tempdir");
    fs::write(dir.path().join("README.md"), "# Demo\n\nFull docs.\n").expect("write");

    let help = plugin_help_text(&plugin_info(dir.path(), MINIMAL_MANIFEST));
    assert_eq!(help, "# Demo\n\nFull docs.\n");
}

#[test]
fn plugin_help_text_honours_an_explicit_docs_path() {
    let dir = tempfile::tempdir().expect("tempdir");
    fs::create_dir_all(dir.path().join("docs")).expect("mkdir");
    fs::write(dir.path().join("README.md"), "readme").expect("write");
    fs::write(dir.path().join("docs/help.md"), "explicit").expect("write");

    let manifest = MINIMAL_MANIFEST.replace(
        r#""permissions": ["fs:read"]"#,
        r#""permissions": ["fs:read"], "docs": "docs/help.md""#,
    );
    let help = plugin_help_text(&plugin_info(dir.path(), &manifest));
    assert_eq!(help, "explicit");
}

#[test]
fn plugin_help_text_ignores_a_traversing_docs_path() {
    let dir = tempfile::tempdir().expect("tempdir");
    let manifest = MINIMAL_MANIFEST.replace(
        r#""permissions": ["fs:read"]"#,
        r#""permissions": ["fs:read"], "docs": "../../../etc/passwd""#,
    );

    let help = plugin_help_text(&plugin_info(dir.path(), &manifest));
    assert!(help.starts_with("# Demo Plugin"));
}

#[test]
fn plugin_help_text_falls_back_to_the_manifest_summary() {
    let dir = tempfile::tempdir().expect("tempdir");
    let manifest = MINIMAL_MANIFEST.replace(
        r#""permissions": ["fs:read"]"#,
        r#""permissions": ["fs:read"],
  "contributes": {
    "settings": [
      { "key": "tone", "type": "select", "label": "Tone", "description": "Voice to use" },
      { "key": "limit", "type": "number", "label": "Limit" }
    ]
  }"#,
    );

    let help = plugin_help_text(&plugin_info(dir.path(), &manifest));
    assert!(help.contains("# Demo Plugin"));
    assert!(help.contains("Does demo things."));
    assert!(help.contains("- Version: 1.2.3"));
    assert!(help.contains("- Permissions: fs:read"));
    assert!(help.contains("## Settings"));
    assert!(help.contains("- `tone` (select): Tone — Voice to use"));
    assert!(help.contains("- `limit` (number): Limit\n"));
}

#[test]
fn plugin_definitions_describe_each_discovered_plugin() {
    let dir = tempfile::tempdir().expect("tempdir");
    let definitions = plugin_definitions(&[plugin_info(dir.path(), MINIMAL_MANIFEST)]);

    assert_eq!(definitions.len(), 1);
    assert_eq!(definitions[0].uri, "carbide://plugin/demo/help");
    assert_eq!(definitions[0].name, "Demo Plugin (plugin help)");
    assert_eq!(
        definitions[0].description.as_deref(),
        Some("Does demo things.")
    );
    assert_eq!(definitions[0].mime_type.as_deref(), Some("text/markdown"));
}
