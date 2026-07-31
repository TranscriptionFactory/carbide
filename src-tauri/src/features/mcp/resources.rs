use std::fs;
use std::path::{Path, PathBuf};

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

use crate::features::mcp::shared_ops;
use crate::features::mcp::types::{ResourceContent, ResourceDefinition};
use crate::features::plugin::service::PluginService;
use crate::features::plugin::types::{PluginInfo, PluginManifest};
use crate::shared::storage;

pub struct Guide {
    pub slug: &'static str,
    pub title: &'static str,
    pub description: &'static str,
}

/// Mirrors `GUIDES` in `src/lib/app/orchestration/help_data.ts` so the MCP help
/// surface and the in-app help dialog offer the same corpus. Kept in sync by
/// `tests/mcp_resources.rs`.
pub const GUIDES: &[Guide] = &[
    Guide {
        slug: "getting_started",
        title: "Getting Started",
        description: "Set up Carbide and learn the basics",
    },
    Guide {
        slug: "architecture",
        title: "Architecture",
        description: "How the codebase is structured",
    },
    Guide {
        slug: "search_and_queries",
        title: "Search & Queries",
        description: "Find notes with full-text and structured queries",
    },
    Guide {
        slug: "language_tools",
        title: "Language Tools",
        description: "Markdown and code LSP servers, linting, and diagnostics",
    },
    Guide {
        slug: "bases_and_references",
        title: "Bases & References",
        description: "Organize notes with bases and cross-references",
    },
    Guide {
        slug: "ai_and_chat",
        title: "AI & Vault Chat",
        description: "Providers, inline ask/edit, and cited vault chat",
    },
    Guide {
        slug: "markdown-syntax-guide",
        title: "Markdown Syntax Guide",
        description: "Supported markdown features and extensions",
    },
    Guide {
        slug: "html_artifacts",
        title: "HTML Artifacts",
        description: "Render, embed, and trust .html files in the vault",
    },
    Guide {
        slug: "document_viewers",
        title: "Document Viewers",
        description: "PDF, EPUB, and other in-app document viewers",
    },
    Guide {
        slug: "web_clipping",
        title: "Web Clipping",
        description: "Clip web pages to Markdown, HTML artifacts, or EPUB",
    },
    Guide {
        slug: "plugin_howto",
        title: "Writing Plugins",
        description: "Build and register custom plugins",
    },
    Guide {
        slug: "html_to_markdown_plugin",
        title: "HTML to Markdown Plugin",
        description: "Convert HTML content to markdown notes",
    },
    Guide {
        slug: "data_storage_locations",
        title: "Data Storage Locations",
        description: "Where Carbide stores your data",
    },
    Guide {
        slug: "UI",
        title: "UI Design System",
        description: "Colors, tokens, and component patterns",
    },
    Guide {
        slug: "CHANGELOG",
        title: "Changelog",
        description: "Recent changes and release notes",
    },
];

pub const DEFAULT_PLUGIN_DOCS_FILE: &str = "README.md";

const MARKDOWN_MIME: &str = "text/markdown";
const GUIDE_URI_PREFIX: &str = "carbide://help/";
const PLUGIN_URI_PREFIX: &str = "carbide://plugin/";
const PLUGIN_URI_SUFFIX: &str = "/help";

#[derive(Debug, PartialEq)]
pub enum ResourceUri {
    Guide(String),
    PluginHelp(String),
}

pub fn guide_uri(slug: &str) -> String {
    format!("{}{}", GUIDE_URI_PREFIX, slug)
}

pub fn plugin_help_uri(plugin_id: &str) -> String {
    format!("{}{}{}", PLUGIN_URI_PREFIX, plugin_id, PLUGIN_URI_SUFFIX)
}

pub fn parse_uri(uri: &str) -> Option<ResourceUri> {
    if let Some(slug) = uri.strip_prefix(GUIDE_URI_PREFIX) {
        return is_bare_segment(slug).then(|| ResourceUri::Guide(slug.to_string()));
    }
    let plugin_id = uri
        .strip_prefix(PLUGIN_URI_PREFIX)?
        .strip_suffix(PLUGIN_URI_SUFFIX)?;
    is_bare_segment(plugin_id).then(|| ResourceUri::PluginHelp(plugin_id.to_string()))
}

fn is_bare_segment(segment: &str) -> bool {
    !segment.is_empty() && !segment.contains('/') && !segment.contains("..")
}

pub fn find_guide(slug: &str) -> Option<&'static Guide> {
    GUIDES.iter().find(|g| g.slug == slug)
}

pub fn guide_definitions() -> Vec<ResourceDefinition> {
    GUIDES
        .iter()
        .map(|guide| ResourceDefinition {
            uri: guide_uri(guide.slug),
            name: guide.title.to_string(),
            description: Some(guide.description.to_string()),
            mime_type: Some(MARKDOWN_MIME.to_string()),
        })
        .collect()
}

pub fn plugin_definitions(plugins: &[PluginInfo]) -> Vec<ResourceDefinition> {
    plugins
        .iter()
        .map(|plugin| ResourceDefinition {
            uri: plugin_help_uri(&plugin.manifest.id),
            name: format!("{} (plugin help)", plugin.manifest.name),
            description: Some(plugin.manifest.description.clone()),
            mime_type: Some(MARKDOWN_MIME.to_string()),
        })
        .collect()
}

/// Tauri maps `../docs/**` resources under a `_up_` prefix in packaged builds,
/// while `tauri dev` exposes them at `docs/` directly. Probe both.
pub fn resolve_docs_dir(resource_dir: &Path) -> Option<PathBuf> {
    ["_up_/docs", "docs"]
        .into_iter()
        .map(|sub| resource_dir.join(sub))
        .find(|dir| dir.is_dir())
}

pub fn read_guide(docs_dir: &Path, slug: &str) -> Result<String, ResourceError> {
    let guide = find_guide(slug).ok_or_else(|| ResourceError::NotFound(guide_uri(slug)))?;
    let path = docs_dir.join(format!("{}.md", guide.slug));
    fs::read_to_string(&path).map_err(|e| {
        ResourceError::Internal(format!("Failed to read guide '{}': {}", guide.slug, e))
    })
}

pub fn plugin_help_text(plugin: &PluginInfo) -> String {
    read_plugin_docs_file(plugin).unwrap_or_else(|| manifest_help_text(&plugin.manifest))
}

fn read_plugin_docs_file(plugin: &PluginInfo) -> Option<String> {
    let relative = plugin
        .manifest
        .docs
        .as_deref()
        .unwrap_or(DEFAULT_PLUGIN_DOCS_FILE);
    if !is_safe_relative_path(relative) {
        log::warn!(
            "Plugin '{}' declares an unsafe docs path: {}",
            plugin.manifest.id,
            relative
        );
        return None;
    }
    fs::read_to_string(Path::new(&plugin.path).join(relative)).ok()
}

fn is_safe_relative_path(relative: &str) -> bool {
    !relative.is_empty() && !relative.contains("..") && !Path::new(relative).is_absolute()
}

fn manifest_help_text(manifest: &PluginManifest) -> String {
    let mut out = format!(
        "# {}\n\n{}\n\n- Version: {}\n- Author: {}\n- Permissions: {}\n",
        manifest.name,
        manifest.description,
        manifest.version,
        manifest.author,
        if manifest.permissions.is_empty() {
            "none".to_string()
        } else {
            manifest.permissions.join(", ")
        }
    );

    let settings = manifest
        .contributes
        .as_ref()
        .and_then(|c| c.settings.as_ref())
        .filter(|s| !s.is_empty());

    if let Some(settings) = settings {
        out.push_str("\n## Settings\n\n");
        for setting in settings {
            let description = setting
                .description
                .as_deref()
                .map(|d| format!(" — {}", d))
                .unwrap_or_default();
            out.push_str(&format!(
                "- `{}` ({}): {}{}\n",
                setting.key, setting.setting_type, setting.label, description
            ));
        }
    }

    out
}

#[derive(Debug)]
pub enum ResourceError {
    NotFound(String),
    Internal(String),
}

impl std::fmt::Display for ResourceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ResourceError::NotFound(uri) => write!(f, "Resource not found: {}", uri),
            ResourceError::Internal(message) => write!(f, "{}", message),
        }
    }
}

pub fn list_resources(app: Option<&AppHandle>) -> Vec<ResourceDefinition> {
    let mut definitions = guide_definitions();
    if let Some(app) = app {
        definitions.extend(plugin_definitions(&discover_plugins(app)));
    }
    definitions
}

pub fn read_resource(app: Option<&AppHandle>, uri: &str) -> Result<ResourceContent, ResourceError> {
    let parsed = parse_uri(uri).ok_or_else(|| ResourceError::NotFound(uri.to_string()))?;
    let app = app.ok_or_else(|| ResourceError::Internal("No app context available".into()))?;

    let text = match parsed {
        ResourceUri::Guide(slug) => {
            let docs_dir = resolve_app_docs_dir(app)?;
            read_guide(&docs_dir, &slug)?
        }
        ResourceUri::PluginHelp(plugin_id) => {
            let plugin = discover_plugins(app)
                .into_iter()
                .find(|p| p.manifest.id == plugin_id)
                .ok_or_else(|| ResourceError::NotFound(plugin_help_uri(&plugin_id)))?;
            plugin_help_text(&plugin)
        }
    };

    Ok(ResourceContent {
        uri: uri.to_string(),
        mime_type: Some(MARKDOWN_MIME.to_string()),
        text: Some(text),
    })
}

fn resolve_app_docs_dir(app: &AppHandle) -> Result<PathBuf, ResourceError> {
    let resource_dir = app
        .path()
        .resolve("", BaseDirectory::Resource)
        .map_err(|e| ResourceError::Internal(format!("Failed to resolve resource dir: {}", e)))?;
    resolve_docs_dir(&resource_dir)
        .ok_or_else(|| ResourceError::Internal("Bundled docs directory not found".into()))
}

fn discover_plugins(app: &AppHandle) -> Vec<PluginInfo> {
    let Some(service) = app.try_state::<PluginService>() else {
        return Vec::new();
    };
    let Ok(home_dir) = app.path().home_dir() else {
        return Vec::new();
    };
    let Some(vault_path) = active_vault_path(app) else {
        return Vec::new();
    };
    service
        .discover(&vault_path, &home_dir)
        .unwrap_or_else(|e| {
            log::warn!("MCP resource listing failed to discover plugins: {}", e);
            Vec::new()
        })
}

fn active_vault_path(app: &AppHandle) -> Option<PathBuf> {
    let vault_id = shared_ops::get_active_vault_id(app).ok().flatten()?;
    storage::vault_path(app, &vault_id).ok()
}
