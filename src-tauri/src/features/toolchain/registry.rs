use super::types::{PlatformBinary, ToolCapability, ToolSpec};

const RUMDL_VERSION: &str = "0.1.5";
const IWE_VERSION: &str = "0.69.0";

static RUMDL_BINARIES: &[PlatformBinary] = &[
    PlatformBinary {
        triple: "aarch64-apple-darwin",
        asset_template: "rumdl-{version}-aarch64-apple-darwin.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-apple-darwin",
        asset_template: "rumdl-{version}-x86_64-apple-darwin.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-unknown-linux-gnu",
        asset_template: "rumdl-{version}-x86_64-unknown-linux-gnu.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-pc-windows-msvc",
        asset_template: "rumdl-{version}-x86_64-pc-windows-msvc.zip",
        sha256: "TODO",
    },
];

static IWE_BINARIES: &[PlatformBinary] = &[
    PlatformBinary {
        triple: "aarch64-apple-darwin",
        asset_template: "iwes-{version}-aarch64-apple-darwin.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-apple-darwin",
        asset_template: "iwes-{version}-x86_64-apple-darwin.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-unknown-linux-gnu",
        asset_template: "iwes-{version}-x86_64-unknown-linux-gnu.tar.gz",
        sha256: "TODO",
    },
    PlatformBinary {
        triple: "x86_64-pc-windows-msvc",
        asset_template: "iwes-{version}-x86_64-pc-windows-msvc.zip",
        sha256: "TODO",
    },
];

pub static TOOLS: &[ToolSpec] = &[
    ToolSpec {
        id: "rumdl",
        display_name: "rumdl",
        github_repo: "dbt-labs/rumdl",
        version: RUMDL_VERSION,
        platform_binaries: RUMDL_BINARIES,
        binary_name: "rumdl",
        default_args: &["server"],
        capabilities: &[
            ToolCapability::DocumentSync { debounce_ms: 300, skip_draft: false },
            ToolCapability::Diagnostics,
            ToolCapability::Formatting,
            ToolCapability::CodeActions,
        ],
    },
    ToolSpec {
        id: "iwes",
        display_name: "IWE",
        github_repo: "TranscriptionFactory/iwe",
        version: IWE_VERSION,
        platform_binaries: IWE_BINARIES,
        binary_name: "iwes",
        default_args: &[],
        capabilities: &[
            ToolCapability::DocumentSync { debounce_ms: 500, skip_draft: true },
            ToolCapability::Diagnostics,
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
