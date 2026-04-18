use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginSettingSchema {
    pub key: String,
    #[serde(rename = "type")]
    pub setting_type: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub default: Option<serde_json::Value>,
    #[serde(default)]
    pub options: Option<Vec<SelectOption>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SelectOption {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RibbonIconContribution {
    pub id: String,
    pub icon: String,
    pub tooltip: String,
    pub command: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PluginContributes {
    #[serde(default)]
    pub settings: Option<Vec<PluginSettingSchema>>,
    #[serde(default)]
    pub ribbon_icons: Option<Vec<RibbonIconContribution>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub api_version: String,
    pub permissions: Vec<String>,
    #[serde(default)]
    pub activation_events: Option<Vec<String>>,
    #[serde(default)]
    pub contributes: Option<PluginContributes>,
    #[serde(default)]
    pub allowed_origins: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginInfo {
    pub manifest: PluginManifest,
    pub path: String,
    pub source: String,
}
