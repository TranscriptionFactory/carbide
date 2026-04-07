use crate::features::toolchain::registry;

#[test]
fn all_tools_have_platform_binaries() {
    for tool in registry::TOOLS {
        assert!(
            !tool.platform_binaries.is_empty(),
            "Tool '{}' has no platform binaries",
            tool.id
        );
    }
}

#[test]
fn marksman_release_tag_is_date() {
    let spec = registry::get("marksman").expect("marksman spec exists");
    assert_eq!(spec.release_tag(), "2026-02-08");
}

#[test]
fn rumdl_release_tag_has_v_prefix() {
    let spec = registry::get("rumdl").expect("rumdl spec exists");
    assert_eq!(spec.release_tag(), "v0.1.59");
}

#[test]
fn all_tools_downloadable() {
    for id in ["rumdl", "marksman", "iwes"] {
        let spec = registry::get(id).expect(&format!("{} spec exists", id));
        assert!(spec.downloadable(), "Tool '{}' should be downloadable", id);
    }
}

#[test]
fn tool_lookup_by_id() {
    assert!(registry::get("rumdl").is_some());
    assert!(registry::get("marksman").is_some());
    assert!(registry::get("iwes").is_some());
    assert!(registry::get("nonexistent").is_none());
}

#[test]
fn all_platform_binaries_have_nonempty_triple() {
    for tool in registry::TOOLS {
        for pb in tool.platform_binaries {
            assert!(
                !pb.triple.is_empty(),
                "Tool '{}' has a platform binary with empty triple",
                tool.id
            );
        }
    }
}
