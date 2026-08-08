use crate::features::pipeline::service as pipeline;

/// The whole point of resolving relative to the shim: `get_expanded_path`
/// prepends every installed nvm/fnm/mise node bin, so PATH can answer for a
/// different install than the shim we are about to run.
#[test]
fn node_is_resolved_from_the_shim_directory_before_path() {
    let temp = tempfile::tempdir().expect("tempdir");
    let bin = temp.path().join("bin");
    std::fs::create_dir_all(&bin).expect("mkdir bin");
    std::fs::write(bin.join("npx"), "").expect("npx");
    std::fs::write(bin.join("node"), "").expect("node");

    let resolved = pipeline::resolve_node_for_shim(&bin.join("npx").to_string_lossy(), "/nonexistent")
        .expect("the sibling node should win");

    assert_eq!(resolved, bin.join("node").to_string_lossy());
}

/// With no sibling, the lookup falls back to PATH rather than inventing a
/// neighbour that is not there.
#[test]
fn a_node_less_shim_directory_never_invents_a_sibling() {
    let temp = tempfile::tempdir().expect("tempdir");
    let npx = temp.path().join("npx");
    std::fs::write(&npx, "").expect("npx");

    let resolved =
        pipeline::resolve_node_for_shim(&npx.to_string_lossy(), &pipeline::get_expanded_path());

    assert!(
        !resolved
            .as_deref()
            .is_some_and(|path| path.starts_with(&*temp.path().to_string_lossy())),
        "resolved {resolved:?} from a directory with no node"
    );
}

/// A file that is not a Node runtime has no readable `--version`, and an
/// unverifiable runtime must never be reported as a bad one.
#[test]
fn an_unreadable_runtime_yields_no_version() {
    let temp = tempfile::tempdir().expect("tempdir");
    let bin = temp.path().join("bin");
    std::fs::create_dir_all(&bin).expect("mkdir bin");
    std::fs::write(bin.join("npx"), "").expect("npx");
    std::fs::write(bin.join("node"), "not a real node").expect("node");

    let runtime =
        pipeline::node_runtime_for_shim(&bin.join("npx").to_string_lossy(), "/nonexistent");

    assert_eq!(runtime, None);
}
