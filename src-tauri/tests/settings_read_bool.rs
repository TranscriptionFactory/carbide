use crate::features::settings::service::{read_bool, SettingsStore};
use serde_json::json;

fn store_with(key: &str, value: serde_json::Value) -> SettingsStore {
    let mut store = SettingsStore::default();
    store.settings.insert(key.to_string(), value);
    store
}

#[test]
fn read_bool_returns_false_for_missing_key() {
    let store = SettingsStore::default();
    assert!(!read_bool(&store, "app.closeToTray"));
}

#[test]
fn read_bool_returns_true_for_explicit_true() {
    let store = store_with("app.closeToTray", json!(true));
    assert!(read_bool(&store, "app.closeToTray"));
}

#[test]
fn read_bool_returns_false_for_explicit_false() {
    let store = store_with("app.closeToTray", json!(false));
    assert!(!read_bool(&store, "app.closeToTray"));
}

#[test]
fn read_bool_returns_false_for_non_bool_value() {
    let store = store_with("app.closeToTray", json!("true"));
    assert!(!read_bool(&store, "app.closeToTray"));
}
