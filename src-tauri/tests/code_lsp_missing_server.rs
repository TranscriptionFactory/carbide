use crate::features::code_lsp::language_config::{
    build_lsp_config, ext_to_language_id, find_server_spec, missing_server_reason,
};
use std::path::Path;

const REGISTERED_EXTENSIONS: &[&str] = &["py", "rs", "ts", "js", "go", "json", "yaml"];

#[test]
fn every_registered_server_names_how_to_install_it() {
    for ext in REGISTERED_EXTENSIONS {
        let language = ext_to_language_id(ext).expect("registered extension");
        let spec = find_server_spec(language).expect("registered language");
        assert!(
            !spec.install_hint.trim().is_empty(),
            "{language} has no install hint"
        );
    }
}

#[test]
fn missing_json_server_reason_names_the_binary_and_the_install_command() {
    let spec = find_server_spec("json").expect("json is registered");
    let reason = missing_server_reason(spec);

    assert!(reason.contains("vscode-json-language-server"), "{reason}");
    assert!(
        reason.contains("npm install -g vscode-langservers-extracted"),
        "{reason}"
    );
}

#[test]
fn code_servers_launch_with_the_expanded_path() {
    let spec = find_server_spec("json").expect("json is registered");
    let config = build_lsp_config(
        spec,
        Path::new("/opt/homebrew/bin/vscode-json-language-server"),
        "file:///vault",
        "/vault",
    );

    let path = config.path_env.expect("code servers get an explicit PATH");
    assert!(path.contains("/opt/homebrew/bin"), "{path}");
}
