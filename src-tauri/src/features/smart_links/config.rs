use super::{default_rules, SmartLinkRuleGroup};
use std::path::Path;

const CONFIG_REL: &str = ".carbide/smart-links/rules.json";

pub fn load_rules(vault_root: &Path) -> Result<Vec<SmartLinkRuleGroup>, String> {
    let path = vault_root.join(CONFIG_REL);
    if !path.is_file() {
        let defaults = default_rules();
        save_rules(vault_root, &defaults)?;
        return Ok(defaults);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub fn save_rules(vault_root: &Path, rules: &[SmartLinkRuleGroup]) -> Result<(), String> {
    let path = vault_root.join(CONFIG_REL);
    let json = serde_json::to_string_pretty(rules).map_err(|e| e.to_string())?;
    crate::shared::io_utils::atomic_write(&path, json.as_bytes())
}
