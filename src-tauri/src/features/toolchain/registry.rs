use super::types::{PlatformBinary, ToolCapability, ToolSpec};

const RUMDL_VERSION: &str = "0.2.55";
const MARKSMAN_VERSION: &str = "2026-02-08";
const IWES_VERSION: &str = "0.19.1";
const MARKDOWN_OXIDE_VERSION: &str = "0.25.12";

static RUMDL_BINARIES: &[PlatformBinary] = &[
    PlatformBinary {
        triple: "aarch64-apple-darwin",
        asset_template: "rumdl-v{version}-aarch64-apple-darwin.tar.gz",
        sha256: "98dd5620e7eb8ba8fd77830fe1f313530ae2a6368ae867149f7de13dbebde6e3",
    },
    PlatformBinary {
        triple: "x86_64-apple-darwin",
        asset_template: "rumdl-v{version}-x86_64-apple-darwin.tar.gz",
        sha256: "8dadf1b9aeda17f8a41ab4fcdd2a7f7dfb6eda8981ddce3ebf61b72e3d1d3f89",
    },
    PlatformBinary {
        triple: "x86_64-unknown-linux-gnu",
        asset_template: "rumdl-v{version}-x86_64-unknown-linux-gnu.tar.gz",
        sha256: "7bddb23415f94c6503fe77f382d4c2398a2b36a78d936a434a8c71c3711da21b",
    },
    PlatformBinary {
        triple: "x86_64-pc-windows-msvc",
        asset_template: "rumdl-v{version}-x86_64-pc-windows-msvc.zip",
        sha256: "47c04176f960e2d196b1e465564869363469ec00714c2970e1f441deff7f679d",
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
        sha256: "c1b131d5998a42b43aad78fa723f86810d29dada340d73cc3db99a8b94a7a00a",
    },
    PlatformBinary {
        triple: "x86_64-apple-darwin",
        asset_template: "iwe-v{version}-x86_64-apple-darwin.tar.gz",
        sha256: "ce09160256aaf1f35309e86cc36d44e63d57a155ff7b679968dbea2ab0d6bcc6",
    },
    PlatformBinary {
        triple: "x86_64-unknown-linux-gnu",
        asset_template: "iwe-v{version}-x86_64-unknown-linux-gnu.tar.gz",
        sha256: "b48035a05d58f3fe185056b7b3078d7b6f6bbee8cc44b29eb401f20fec046a97",
    },
    PlatformBinary {
        triple: "x86_64-pc-windows-msvc",
        asset_template: "iwe-v{version}-x86_64-pc-windows-msvc.zip",
        sha256: "462bc906edec803b23619b63ffd9d90e9c3bce6edcdea14f0133f354abbab1a1",
    },
];

static MARKDOWN_OXIDE_BINARIES: &[PlatformBinary] = &[
    PlatformBinary {
        triple: "aarch64-apple-darwin",
        asset_template: "markdown-oxide-v{version}-aarch64-apple-darwin.tar.gz",
        sha256: "fd851fbec60dc7cda5b21c682232e5c6ae6671c726e64bce3fe20013223c5774",
    },
    PlatformBinary {
        triple: "x86_64-apple-darwin",
        asset_template: "markdown-oxide-v{version}-x86_64-apple-darwin.tar.gz",
        sha256: "706faf36ab17de112b9811090ef275e3e27472c2382bccf33880cce48e0a03c7",
    },
    PlatformBinary {
        triple: "x86_64-unknown-linux-gnu",
        asset_template: "markdown-oxide-v{version}-x86_64-unknown-linux-gnu.tar.gz",
        sha256: "ad4248cf5d3f0e9d9f120b579501c45dad9c46bfcb4ddec36d2cb85d68a58828",
    },
    PlatformBinary {
        triple: "x86_64-pc-windows-msvc",
        asset_template: "markdown-oxide-v{version}-x86_64-pc-windows-gnu.zip",
        sha256: "876c5d448abd44211f14d8d611e91b2152f6e3aec98702da976489891bab8839",
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
