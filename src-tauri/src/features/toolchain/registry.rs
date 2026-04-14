use super::types::{PlatformBinary, ToolCapability, ToolSpec};

const RUMDL_VERSION: &str = "0.1.59";
const MARKSMAN_VERSION: &str = "2026-02-08";
const IWES_VERSION: &str = "0.0.67";
const MARKDOWN_OXIDE_VERSION: &str = "0.25.10";

static RUMDL_BINARIES: &[PlatformBinary] = &[
    PlatformBinary {
        triple: "aarch64-apple-darwin",
        asset_template: "rumdl-v{version}-aarch64-apple-darwin.tar.gz",
        sha256: "abebb21d20687b2e4716a885a332444dd904eb36b5484c4176783d5850d48576",
    },
    PlatformBinary {
        triple: "x86_64-apple-darwin",
        asset_template: "rumdl-v{version}-x86_64-apple-darwin.tar.gz",
        sha256: "7e3b1f283341f241b3d9e89fc4f30bc2d5c459eedfb95592dd403f5af782f1c4",
    },
    PlatformBinary {
        triple: "x86_64-unknown-linux-gnu",
        asset_template: "rumdl-v{version}-x86_64-unknown-linux-gnu.tar.gz",
        sha256: "44415ba79bfaf089f3e81c1a60dbbec99464b0bfe2169b541337cb62cd829533",
    },
    PlatformBinary {
        triple: "x86_64-pc-windows-msvc",
        asset_template: "rumdl-v{version}-x86_64-pc-windows-msvc.zip",
        sha256: "a584c0683e07e48c8b214d9a71dfbdba79f232081165b7885ea942b8bc278248",
    },
];

static MARKSMAN_BINARIES: &[PlatformBinary] = &[
    PlatformBinary {
        triple: "aarch64-apple-darwin",
        asset_template: "marksman-macos",
        sha256: "6a801c17b5ac0dba69787c5282b3b3bd416e66c96253fae098d311c6bbd1833b",
    },
    PlatformBinary {
        triple: "x86_64-apple-darwin",
        asset_template: "marksman-macos",
        sha256: "6a801c17b5ac0dba69787c5282b3b3bd416e66c96253fae098d311c6bbd1833b",
    },
    PlatformBinary {
        triple: "x86_64-unknown-linux-gnu",
        asset_template: "marksman-linux-x64",
        sha256: "be5098e8213219269c47fc0d916a66fa31ce0602ec967475c722260aabf26087",
    },
    PlatformBinary {
        triple: "x86_64-pc-windows-msvc",
        asset_template: "marksman.exe",
        sha256: "a6d05beb08ebe41b0a9f09c98a438540421436fa5531424c22e0bb1d22529705",
    },
];

static IWES_BINARIES: &[PlatformBinary] = &[
    PlatformBinary {
        triple: "aarch64-apple-darwin",
        asset_template: "iwe-v{version}-aarch64-apple-darwin.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-apple-darwin",
        asset_template: "iwe-v{version}-x86_64-apple-darwin.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-unknown-linux-gnu",
        asset_template: "iwe-v{version}-x86_64-unknown-linux-gnu.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-pc-windows-msvc",
        asset_template: "iwe-v{version}-x86_64-pc-windows-msvc.tar.gz",
        sha256: "TODO",
    },
];

static MARKDOWN_OXIDE_BINARIES: &[PlatformBinary] = &[
    PlatformBinary {
        triple: "aarch64-apple-darwin",
        asset_template: "markdown-oxide-v{version}-aarch64-apple-darwin.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-apple-darwin",
        asset_template: "markdown-oxide-v{version}-x86_64-apple-darwin.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-unknown-linux-gnu",
        asset_template: "markdown-oxide-v{version}-x86_64-unknown-linux-gnu.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-pc-windows-msvc",
        asset_template: "markdown-oxide-v{version}-x86_64-pc-windows-gnu.zip",
        sha256: "TODO",
    },
];

pub static TOOLS: &[ToolSpec] = &[
    ToolSpec {
        id: "rumdl",
        display_name: "rumdl",
        github_repo: "rvben/rumdl",
        version: RUMDL_VERSION,
        release_tag_template: "v{version}",
        platform_binaries: RUMDL_BINARIES,
        binary_name: "rumdl",
        default_args: &["server"],
        capabilities: &[
            ToolCapability::DocumentSync {
                debounce_ms: 300,
                skip_draft: false,
            },
            ToolCapability::Diagnostics,
            ToolCapability::Formatting,
            ToolCapability::CodeActions,
        ],
    },
    ToolSpec {
        id: "iwes",
        display_name: "IWE",
        github_repo: "iwe-org/iwe",
        version: IWES_VERSION,
        release_tag_template: "iwe-v{version}",
        platform_binaries: IWES_BINARIES,
        binary_name: "iwes",
        default_args: &[],
        capabilities: &[
            ToolCapability::DocumentSync {
                debounce_ms: 300,
                skip_draft: false,
            },
            ToolCapability::Completion,
            ToolCapability::Hover,
            ToolCapability::References,
            ToolCapability::Definition,
            ToolCapability::Rename,
            ToolCapability::Formatting,
            ToolCapability::CodeActions,
            ToolCapability::WorkspaceSymbols,
            ToolCapability::InlayHints,
        ],
    },
    ToolSpec {
        id: "markdown-oxide",
        display_name: "Markdown Oxide",
        github_repo: "Feel-ix-343/markdown-oxide",
        version: MARKDOWN_OXIDE_VERSION,
        release_tag_template: "v{version}",
        platform_binaries: MARKDOWN_OXIDE_BINARIES,
        binary_name: "markdown-oxide",
        default_args: &[],
        capabilities: &[
            ToolCapability::DocumentSync {
                debounce_ms: 300,
                skip_draft: false,
            },
            ToolCapability::Completion,
            ToolCapability::Hover,
            ToolCapability::References,
            ToolCapability::Definition,
            ToolCapability::Rename,
            ToolCapability::CodeActions,
            ToolCapability::WorkspaceSymbols,
        ],
    },
    ToolSpec {
        id: "marksman",
        display_name: "Marksman",
        github_repo: "artempyanykh/marksman",
        version: MARKSMAN_VERSION,
        release_tag_template: "{version}",
        platform_binaries: MARKSMAN_BINARIES,
        binary_name: "marksman",
        default_args: &[],
        capabilities: &[
            ToolCapability::DocumentSync {
                debounce_ms: 500,
                skip_draft: true,
            },
            ToolCapability::Completion,
            ToolCapability::Hover,
            ToolCapability::References,
            ToolCapability::Definition,
            ToolCapability::Rename,
            ToolCapability::Formatting,
            ToolCapability::CodeActions,
            ToolCapability::WorkspaceSymbols,
            ToolCapability::InlayHints,
        ],
    },
];

pub fn get(id: &str) -> Option<&'static ToolSpec> {
    TOOLS.iter().find(|t| t.id == id)
}
