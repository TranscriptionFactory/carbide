use crate::features::toolchain::registry;

#[test]
fn iwes_spec_is_downloadable() {
    let spec = registry::get("iwes").expect("iwes spec exists");
    assert!(
        spec.downloadable(),
        "IWES should be downloadable now that platform_binaries are populated"
    );
}

#[test]
fn iwes_release_tag_uses_iwe_prefix() {
    let spec = registry::get("iwes").expect("iwes spec exists");
    assert_eq!(spec.release_tag(), "iwe-v0.0.67");
}

#[test]
fn iwes_github_repo_is_iwe_org() {
    let spec = registry::get("iwes").expect("iwes spec exists");
    assert_eq!(spec.github_repo, "iwe-org/iwe");
}

#[test]
fn iwes_download_url_is_well_formed() {
    let spec = registry::get("iwes").expect("iwes spec exists");
    let tag = spec.release_tag();
    for pb in spec.platform_binaries {
        let asset = pb.asset_template.replace("{version}", spec.version);
        let url = format!(
            "https://github.com/{}/releases/download/{}/{}",
            spec.github_repo, tag, asset
        );
        assert!(url.starts_with(
            "https://github.com/iwe-org/iwe/releases/download/iwe-v0.0.67/iwe-v0.0.67-"
        ));
        assert!(url.contains(pb.triple));
    }
}
