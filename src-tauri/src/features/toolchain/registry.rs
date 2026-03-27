use super::types::{PlatformBinary, ToolCapability, ToolSpec};

const RUMDL_VERSION: &str = "0.1.59";
const MARKSMAN_VERSION: &str = "2025-03-01";

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

pub static TOOLS: &[ToolSpec] = &[
    ToolSpec {
        id: "rumdl",
        display_name: "rumdl",
        github_repo: "rvben/rumdl",
        version: RUMDL_VERSION,
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
        id: "marksman",
        display_name: "Marksman",
        github_repo: "",
        version: MARKSMAN_VERSION,
        platform_binaries: &[],
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
