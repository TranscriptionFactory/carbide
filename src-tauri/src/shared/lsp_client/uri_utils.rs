use std::path::Path;

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push(hi << 4 | lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| input.to_string())
}

pub fn uri_to_relative_path(uri: &str, vault_path: &Path) -> String {
    let raw = uri.strip_prefix("file://").unwrap_or(uri);

    let decoded = percent_decode(raw);
    let abs = Path::new(&decoded);

    let try_strip = |base: &Path| -> Option<String> {
        abs.strip_prefix(base)
            .ok()
            .map(|rel| rel.to_string_lossy().into_owned())
    };

    if let Some(rel) = try_strip(vault_path) {
        return rel;
    }

    if let Ok(canon_vault) = vault_path.canonicalize() {
        if let Some(rel) = try_strip(&canon_vault) {
            return rel;
        }
    }

    if let Ok(canon_abs) = abs.canonicalize() {
        if let Some(rel) = canon_abs
            .strip_prefix(vault_path)
            .ok()
            .map(|r| r.to_string_lossy().into_owned())
        {
            return rel;
        }
        if let Ok(canon_vault) = vault_path.canonicalize() {
            if let Some(rel) = canon_abs
                .strip_prefix(&canon_vault)
                .ok()
                .map(|r| r.to_string_lossy().into_owned())
            {
                return rel;
            }
        }
    }

    log::warn!(
        "Could not relativize diagnostic URI: {} against vault {:?}",
        uri,
        vault_path
    );
    decoded
}

pub fn file_uri(vault_path: &Path, file_path: &str) -> String {
    let full = vault_path.join(file_path);
    tauri::Url::from_file_path(&full)
        .map(|u| u.to_string())
        .unwrap_or_else(|_| format!("file://{}", full.display()))
}
