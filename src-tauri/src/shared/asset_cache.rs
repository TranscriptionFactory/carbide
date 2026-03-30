use crate::shared::cache::ObservableCache;
use std::sync::Mutex;
use tauri::http::{Request, Response};

const MAX_CACHEABLE_BYTES: usize = 10 * 1024 * 1024;

pub struct CachedAsset {
    pub bytes: Vec<u8>,
    pub mime: String,
    pub etag: String,
    pub content_length: usize,
}

impl Clone for CachedAsset {
    fn clone(&self) -> Self {
        Self {
            bytes: self.bytes.clone(),
            mime: self.mime.clone(),
            etag: self.etag.clone(),
            content_length: self.content_length,
        }
    }
}

#[derive(Clone, Copy)]
pub enum CachePolicy {
    Immutable,
    ModerateLifetime,
    ShortWithValidation,
    Skip,
}

impl CachePolicy {
    fn cache_control(&self) -> &'static str {
        match self {
            CachePolicy::Immutable => "public, max-age=31536000, immutable",
            CachePolicy::ModerateLifetime => "public, max-age=300",
            CachePolicy::ShortWithValidation => "public, max-age=30",
            CachePolicy::Skip => "no-store",
        }
    }
}

pub struct AssetCacheState {
    pub vault: Mutex<ObservableCache<String, CachedAsset>>,
    pub plugin: Mutex<ObservableCache<String, CachedAsset>>,
    pub excalidraw: Mutex<ObservableCache<String, CachedAsset>>,
}

impl AssetCacheState {
    pub fn new() -> Self {
        Self {
            vault: Mutex::new(ObservableCache::new(256)),
            plugin: Mutex::new(ObservableCache::new(64)),
            excalidraw: Mutex::new(ObservableCache::new(128)),
        }
    }
}

pub fn compute_etag(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

pub fn check_conditional(req: &Request<Vec<u8>>, etag: &str) -> bool {
    req.headers()
        .get("If-None-Match")
        .and_then(|v| v.to_str().ok())
        .map(|v| {
            v.split(',')
                .any(|t| t.trim().trim_matches('"') == etag)
        })
        .unwrap_or(false)
}

pub fn build_cached_response(
    asset: &CachedAsset,
    policy: CachePolicy,
    is_304: bool,
) -> Response<Vec<u8>> {
    let status = if is_304 { 304 } else { 200 };
    let body = if is_304 {
        Vec::new()
    } else {
        asset.bytes.clone()
    };

    let mut builder = Response::builder()
        .status(status)
        .header("Content-Type", &asset.mime)
        .header("Cache-Control", policy.cache_control())
        .header("Access-Control-Allow-Origin", "*");

    if !matches!(policy, CachePolicy::Skip) {
        builder = builder.header("ETag", format!("\"{}\"", asset.etag));
    }

    if !is_304 {
        builder = builder.header("Content-Length", asset.content_length.to_string());
    }

    builder.body(body).unwrap()
}

pub fn build_skip_response(bytes: Vec<u8>, mime: &str) -> Response<Vec<u8>> {
    Response::builder()
        .header("Content-Type", mime)
        .header("Content-Length", bytes.len().to_string())
        .header("Cache-Control", "no-store")
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .unwrap()
}

pub fn serve_with_cache(
    cache: &Mutex<ObservableCache<String, CachedAsset>>,
    key: String,
    policy: CachePolicy,
    req: &Request<Vec<u8>>,
    read_bytes: impl FnOnce() -> Option<(Vec<u8>, String)>,
) -> Response<Vec<u8>> {
    // Try cache first
    {
        let mut c = cache.lock().unwrap();
        if let Some(asset) = c.get_cloned(&key) {
            let is_304 = check_conditional(req, &asset.etag);
            return build_cached_response(&asset, policy, is_304);
        }
    }
    // Cache miss — do I/O outside lock
    let (bytes, mime) = match read_bytes() {
        Some(v) => v,
        None => return Response::builder().status(404).body(Vec::new()).unwrap(),
    };

    let etag = compute_etag(&bytes);
    let content_length = bytes.len();
    let asset = CachedAsset {
        bytes,
        mime,
        etag,
        content_length,
    };

    let is_304 = check_conditional(req, &asset.etag);
    let response = build_cached_response(&asset, policy, is_304);

    if content_length <= MAX_CACHEABLE_BYTES {
        let mut c = cache.lock().unwrap();
        c.insert(key, asset);
    }

    response
}

#[tauri::command]
#[specta::specta]
pub fn invalidate_asset_cache(
    state: tauri::State<'_, AssetCacheState>,
    vault_id: String,
    asset_path: String,
) -> Result<(), String> {
    let prefix = format!("{}/{}", vault_id, asset_path);
    let mut cache = state.vault.lock().unwrap();
    cache.invalidate_matching(|k| k.starts_with(&prefix));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_etag_deterministic() {
        let data = b"hello world";
        assert_eq!(compute_etag(data), compute_etag(data));
    }

    #[test]
    fn check_conditional_match() {
        let etag = compute_etag(b"test");
        let req = Request::builder()
            .header("If-None-Match", format!("\"{}\"", etag))
            .body(Vec::new())
            .unwrap();
        assert!(check_conditional(&req, &etag));
    }

    #[test]
    fn check_conditional_mismatch() {
        let req = Request::builder()
            .header("If-None-Match", "\"wrong\"")
            .body(Vec::new())
            .unwrap();
        assert!(!check_conditional(&req, "correct"));
    }

    #[test]
    fn check_conditional_no_header() {
        let req = Request::builder().body(Vec::new()).unwrap();
        assert!(!check_conditional(&req, "anything"));
    }

    #[test]
    fn response_immutable_headers() {
        let asset = CachedAsset {
            bytes: vec![1, 2, 3],
            mime: "image/png".into(),
            etag: "abc123".into(),
            content_length: 3,
        };
        let resp = build_cached_response(&asset, CachePolicy::Immutable, false);
        assert_eq!(resp.status(), 200);
        assert_eq!(
            resp.headers().get("Cache-Control").unwrap(),
            "public, max-age=31536000, immutable"
        );
        assert_eq!(resp.headers().get("ETag").unwrap(), "\"abc123\"");
    }

    #[test]
    fn response_304_empty_body() {
        let asset = CachedAsset {
            bytes: vec![1, 2, 3],
            mime: "image/png".into(),
            etag: "abc123".into(),
            content_length: 3,
        };
        let resp = build_cached_response(&asset, CachePolicy::Immutable, true);
        assert_eq!(resp.status(), 304);
        assert!(resp.body().is_empty());
        assert_eq!(resp.headers().get("ETag").unwrap(), "\"abc123\"");
    }

    #[test]
    fn cache_miss_then_hit() {
        let cache = Mutex::new(ObservableCache::<String, CachedAsset>::new(4));
        let asset = CachedAsset {
            bytes: vec![10, 20],
            mime: "text/plain".into(),
            etag: compute_etag(&[10, 20]),
            content_length: 2,
        };
        {
            let mut c = cache.lock().unwrap();
            assert!(c.get(&"key".to_string()).is_none());
            c.insert("key".to_string(), asset.clone());
        }
        {
            let mut c = cache.lock().unwrap();
            let hit = c.get_cloned(&"key".to_string());
            assert!(hit.is_some());
            assert_eq!(hit.unwrap().bytes, vec![10, 20]);
        }
    }

    #[test]
    fn invalidate_prefix() {
        let cache = Mutex::new(ObservableCache::<String, CachedAsset>::new(8));
        let make = |_: &str| CachedAsset {
            bytes: vec![1],
            mime: "x".into(),
            etag: "e".into(),
            content_length: 1,
        };
        {
            let mut c = cache.lock().unwrap();
            c.insert("v1/a.png".into(), make("v1/a.png"));
            c.insert("v1/b.png".into(), make("v1/b.png"));
            c.insert("v2/c.png".into(), make("v2/c.png"));
            let removed = c.invalidate_matching(|k| k.starts_with("v1/"));
            assert_eq!(removed, 2);
            assert_eq!(c.len(), 1);
        }
    }

    #[test]
    fn large_file_skips_cache() {
        let cache = Mutex::new(ObservableCache::<String, CachedAsset>::new(4));
        let req = Request::builder().body(Vec::new()).unwrap();
        let large = vec![0u8; MAX_CACHEABLE_BYTES + 1];
        let large_clone = large.clone();
        let resp = serve_with_cache(
            &cache,
            "big".into(),
            CachePolicy::ShortWithValidation,
            &req,
            || Some((large_clone, "application/octet-stream".into())),
        );
        assert_eq!(resp.status(), 200);
        assert_eq!(cache.lock().unwrap().len(), 0);
    }

    #[test]
    fn send_sync_bounds() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<AssetCacheState>();
    }
}
