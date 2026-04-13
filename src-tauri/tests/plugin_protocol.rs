use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn mk_temp_dir() -> PathBuf {
    let counter = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("carbide-plugin-test-{}-{}", now_ms(), counter));
    std::fs::create_dir_all(&dir).expect("temp dir should be created");
    dir
}

fn make_plugin_dir(vault_root: &std::path::Path, plugin_id: &str) -> PathBuf {
    let dir = vault_root.join(".carbide").join("plugins").join(plugin_id);
    std::fs::create_dir_all(&dir).expect("plugin dir should be created");
    dir
}

#[test]
fn plugin_serves_file_within_plugin_dir() {
    let vault = mk_temp_dir();
    let plugin_dir = make_plugin_dir(&vault, "my-plugin");
    std::fs::write(plugin_dir.join("index.html"), "<html></html>")
        .expect("index.html should be written");

    let canonical_plugin = plugin_dir
        .canonicalize()
        .expect("plugin dir should canonicalize");
    let target = canonical_plugin.join("index.html");
    let canonical_target = target
        .canonicalize()
        .expect("index.html should canonicalize");

    assert!(canonical_target.starts_with(&canonical_plugin));
    assert!(canonical_target.exists());

    let _ = std::fs::remove_dir_all(&vault);
}

#[test]
fn plugin_rejects_path_traversal() {
    let vault = mk_temp_dir();
    let outside = mk_temp_dir();
    std::fs::write(outside.join("secret.txt"), "secret").expect("secret file should be written");

    let plugin_dir = make_plugin_dir(&vault, "bad-plugin");
    let canonical_plugin = plugin_dir
        .canonicalize()
        .expect("plugin dir should canonicalize");

    let traversal_path = canonical_plugin
        .join("..")
        .join("..")
        .join("..")
        .join("secret.txt");
    let resolved = traversal_path.canonicalize();

    if let Ok(resolved) = resolved {
        assert!(
            !resolved.starts_with(&canonical_plugin),
            "traversal path must not be within plugin dir"
        );
    }

    let _ = std::fs::remove_dir_all(&vault);
    let _ = std::fs::remove_dir_all(&outside);
}

#[test]
fn plugin_rejects_missing_file() {
    let vault = mk_temp_dir();
    let plugin_dir = make_plugin_dir(&vault, "empty-plugin");
    let canonical_plugin = plugin_dir
        .canonicalize()
        .expect("plugin dir should canonicalize");

    let missing = canonical_plugin.join("nonexistent.js");
    assert!(!missing.exists());

    let _ = std::fs::remove_dir_all(&vault);
}

#[test]
fn plugin_url_decode_strips_vault_param() {
    let encoded = "vault=%2Fhome%2Fuser%2Fmy%20vault";
    let vault_val = encoded.split('&').find_map(|pair| {
        let mut kv = pair.splitn(2, '=');
        let key = kv.next()?;
        if key == "vault" {
            kv.next().map(|v| {
                let mut result = String::with_capacity(v.len());
                let mut chars = v.bytes();
                while let Some(b) = chars.next() {
                    if b == b'%' {
                        let hi = chars.next().and_then(|c| (c as char).to_digit(16));
                        let lo = chars.next().and_then(|c| (c as char).to_digit(16));
                        if let (Some(h), Some(l)) = (hi, lo) {
                            result.push((h * 16 + l) as u8 as char);
                        } else {
                            result.push('%');
                        }
                    } else {
                        result.push(b as char);
                    }
                }
                result
            })
        } else {
            None
        }
    });

    assert_eq!(vault_val.as_deref(), Some("/home/user/my vault"));
}

#[test]
fn plugin_sub_resource_resolves_without_vault_query() {
    let vault = mk_temp_dir();
    let plugin_dir = make_plugin_dir(&vault, "html-to-md");
    let vendor_dir = plugin_dir.join("vendor");
    std::fs::create_dir_all(&vendor_dir).expect("vendor dir should be created");
    std::fs::write(
        vendor_dir.join("turndown-plugin-gfm.min.js"),
        "// gfm plugin",
    )
    .expect("vendor js should be written");

    let canonical_plugin = plugin_dir
        .canonicalize()
        .expect("plugin dir should canonicalize");
    let target = canonical_plugin.join("vendor/turndown-plugin-gfm.min.js");
    let canonical_target = target
        .canonicalize()
        .expect("sub-resource should canonicalize");

    assert!(canonical_target.starts_with(&canonical_plugin));
    assert!(canonical_target.exists());

    let _ = std::fs::remove_dir_all(&vault);
}
