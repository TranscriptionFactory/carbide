use crate::features::smart_links::{default_rules, SmartLinkRuleGroup};
use tempfile::TempDir;

#[test]
fn load_creates_defaults_when_missing() {
    let tmp = TempDir::new().expect("temp dir");
    let rules = crate::features::smart_links::config::load_rules(tmp.path()).expect("load");
    assert_eq!(rules.len(), 2);
    assert_eq!(rules[0].rules.len(), 3);
    assert_eq!(rules[1].rules.len(), 4);

    let config_path = tmp.path().join(".carbide/smart-links/rules.json");
    assert!(config_path.is_file());
}

#[test]
fn save_then_load_round_trips() {
    let tmp = TempDir::new().expect("temp dir");
    let mut rules = default_rules();
    rules[0].rules[0].enabled = false;
    rules[0].rules[1].weight = 0.9;

    crate::features::smart_links::config::save_rules(tmp.path(), &rules).expect("save");
    let loaded = crate::features::smart_links::config::load_rules(tmp.path()).expect("load");

    assert_eq!(loaded[0].rules[0].enabled, false);
    assert!((loaded[0].rules[1].weight - 0.9).abs() < 0.001);
}

#[test]
fn load_existing_config_does_not_overwrite() {
    let tmp = TempDir::new().expect("temp dir");
    let mut rules = default_rules();
    rules[0].rules[0].weight = 0.99;
    crate::features::smart_links::config::save_rules(tmp.path(), &rules).expect("save");

    let loaded = crate::features::smart_links::config::load_rules(tmp.path()).expect("load");
    assert!((loaded[0].rules[0].weight - 0.99).abs() < 0.001);
}
