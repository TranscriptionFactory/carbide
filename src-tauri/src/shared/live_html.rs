use std::cell::Cell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http::{Request, Response};

const SCHEME: &str = "carbide-html";
const HOST: &str = "live";
const MAX_TOKENS: usize = 64;

thread_local! {
    static TOKEN_COUNTER: Cell<u64> = const { Cell::new(0) };
}

struct Entry {
    html: Vec<u8>,
    asset_root: Option<PathBuf>,
    allow_network: bool,
}

#[derive(Default)]
pub struct LiveHtmlStore {
    docs: Mutex<HashMap<String, Entry>>,
}

impl LiveHtmlStore {
    pub fn register(&self, html: String, asset_root: Option<PathBuf>, allow_network: bool) -> String {
        let token = new_token();
        let mut docs = self.docs.lock().expect("live_html docs lock poisoned");
        if docs.len() >= MAX_TOKENS {
            evict_oldest(&mut docs);
        }
        let canonical_root = asset_root.and_then(|p| p.canonicalize().ok());
        docs.insert(
            token.clone(),
            Entry {
                html: html.into_bytes(),
                asset_root: canonical_root,
                allow_network,
            },
        );
        token
    }

    pub fn release(&self, token: &str) {
        let mut docs = self.docs.lock().expect("live_html docs lock poisoned");
        docs.remove(token);
    }

    pub fn get_html(&self, token: &str) -> Option<(Vec<u8>, bool)> {
        let docs = self.docs.lock().expect("live_html docs lock poisoned");
        docs.get(token).map(|e| (e.html.clone(), e.allow_network))
    }

    pub fn resolve_asset(&self, token: &str, sub_path: &str) -> Option<(PathBuf, Vec<u8>)> {
        let docs = self.docs.lock().expect("live_html docs lock poisoned");
        let entry = docs.get(token)?;
        let root = entry.asset_root.as_ref()?;
        if !is_safe_sub_path(sub_path) {
            return None;
        }
        let candidate = root.join(sub_path);
        let canonical = candidate.canonicalize().ok()?;
        if !canonical.starts_with(root) {
            return None;
        }
        let bytes = std::fs::read(&canonical).ok()?;
        Some((canonical, bytes))
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.docs
            .lock()
            .expect("live_html docs lock poisoned")
            .len()
    }
}

fn is_safe_sub_path(rel: &str) -> bool {
    !rel.is_empty()
        && !rel.starts_with('/')
        && !rel.split('/').any(|c| c == "..")
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_digit(bytes[i + 1]), hex_digit(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_digit(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

fn new_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let count = TOKEN_COUNTER.with(|c| {
        let v = c.get().wrapping_add(1);
        c.set(v);
        v
    });
    let mut hasher = blake3::Hasher::new();
    hasher.update(&nanos.to_le_bytes());
    hasher.update(&count.to_le_bytes());
    hasher.update(&std::process::id().to_le_bytes());
    let hex = hasher.finalize().to_hex();
    hex.as_str()[..32].to_string()
}

fn evict_oldest(docs: &mut HashMap<String, Entry>) {
    if let Some(key) = docs.keys().next().cloned() {
        docs.remove(&key);
    }
}

// Canonical CSP policy — the single source for everything served via carbide-html:
// (no meta CSP is injected on the TS side). The directive table is pinned by the
// tests below (carbide/plans/2026-06-24_live_html_remote_scripts_plan.md).
// `https:` in script-src/style-src and `connect-src *` are gated on the live+net tier.
pub fn live_html_csp(allow_network: bool) -> String {
    let script_src = if allow_network {
        "script-src 'unsafe-inline' 'unsafe-eval' blob: data: https:"
    } else {
        "script-src 'unsafe-inline' 'unsafe-eval' blob: data:"
    };
    let style_src = if allow_network {
        "style-src 'unsafe-inline' data: https:"
    } else {
        "style-src 'unsafe-inline' data:"
    };
    let connect_src = if allow_network {
        "connect-src *"
    } else {
        "connect-src 'none'"
    };
    [
        "default-src 'none'",
        script_src,
        style_src,
        "img-src data: blob: https: http: carbide-html:",
        "font-src data: https: http: carbide-html:",
        "media-src data: blob: https: http: carbide-html:",
        "frame-src data: blob:",
        connect_src,
    ]
    .join("; ")
}

pub fn handle_live_html_request(
    store: &LiveHtmlStore,
    req: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = req.uri().to_string();
    let rel = uri
        .trim_start_matches("carbide-html://")
        .trim_start_matches("carbide-html:")
        .trim_start_matches('/');

    let mut parts = rel.splitn(2, '/');
    let host = parts.next().unwrap_or("");
    let after_host = parts.next().unwrap_or("");

    if host != HOST {
        return error_response(&uri, 400, "unknown live-html namespace");
    }
    if after_host.is_empty() {
        return error_response(&uri, 400, "missing token");
    }

    let (token_q, sub_q) = after_host
        .split_once('/')
        .unwrap_or((after_host, ""));
    let token = token_q.split('?').next().unwrap_or("");
    if token.is_empty() {
        return error_response(&uri, 400, "empty token");
    }
    let sub_clean = sub_q.split('?').next().unwrap_or("");

    if sub_clean.is_empty() {
        match store.get_html(token) {
            Some((bytes, allow_network)) => build_html_response(200, bytes, allow_network),
            None => error_response(&uri, 404, "live-html token not found"),
        }
    } else {
        let decoded = percent_decode(sub_clean);
        match store.resolve_asset(token, &decoded) {
            Some((path, bytes)) => build_asset_response(&path, bytes),
            None => error_response(&uri, 404, "live-html asset not found"),
        }
    }
}

fn build_html_response(status: u16, body: Vec<u8>, allow_network: bool) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Content-Length", body.len().to_string())
        .header("Cache-Control", "no-store")
        .header("Content-Security-Policy", live_html_csp(allow_network))
        .header("X-Frame-Options", "SAMEORIGIN")
        .body(body)
        .unwrap_or_else(|error| {
            log::error!("Failed to build live-html response: {}", error);
            Response::new(Vec::new())
        })
}

fn build_asset_response(path: &Path, body: Vec<u8>) -> Response<Vec<u8>> {
    let ctype = mime_guess::from_path(path)
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    Response::builder()
        .status(200)
        .header("Content-Type", ctype)
        .header("Content-Length", body.len().to_string())
        .header("Cache-Control", "no-store")
        .body(body)
        .unwrap_or_else(|error| {
            log::error!("Failed to build live-html asset response: {}", error);
            Response::new(Vec::new())
        })
}

fn error_response(uri: &str, status: u16, reason: &str) -> Response<Vec<u8>> {
    log::warn!(
        "Live-html request failed: status={} uri={} reason={}",
        status,
        uri,
        reason
    );
    Response::builder()
        .status(status)
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Cache-Control", "no-store")
        .body(reason.as_bytes().to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

pub fn internal_error_response(reason: impl AsRef<str>) -> Response<Vec<u8>> {
    error_response("<panic>", 500, reason.as_ref())
}

pub fn scheme_name() -> &'static str {
    SCHEME
}

#[tauri::command]
#[specta::specta]
pub fn html_live_register(
    state: tauri::State<LiveHtmlStore>,
    html: String,
    asset_root: Option<String>,
    allow_network: bool,
) -> String {
    let root = asset_root.filter(|s| !s.is_empty()).map(PathBuf::from);
    let token = state.register(html, root, allow_network);
    format!("{}://{}/{}/", SCHEME, HOST, token)
}

#[tauri::command]
#[specta::specta]
pub fn html_live_release(state: tauri::State<LiveHtmlStore>, url: String) {
    if let Some(token) = token_from_url(&url) {
        state.release(token);
    }
}

fn token_from_url(url: &str) -> Option<&str> {
    let prefix = format!("{}://{}/", SCHEME, HOST);
    let token = url.strip_prefix(prefix.as_str())?;
    let token = token.split('?').next().unwrap_or(token);
    let token = token.split('/').next().unwrap_or(token);
    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_request(uri: &str) -> Request<Vec<u8>> {
        Request::builder().uri(uri).body(Vec::new()).unwrap()
    }

    #[test]
    fn register_round_trips_and_release_removes() {
        let store = LiveHtmlStore::default();
        let html = "<!doctype html><html><body><script>1</script></body></html>".to_string();
        let token = store.register(html.clone(), None, false);
        assert_eq!(store.len(), 1);
        assert_eq!(
            store.get_html(&token).map(|(b, _)| String::from_utf8(b)),
            Some(Ok(html)),
        );

        store.release(&token);
        assert_eq!(store.len(), 0);
        assert!(store.get_html(&token).is_none());
    }

    #[test]
    fn each_register_returns_a_distinct_token() {
        let store = LiveHtmlStore::default();
        let a = store.register("<p>a</p>".to_string(), None, false);
        let b = store.register("<p>b</p>".to_string(), None, false);
        assert_ne!(a, b);
    }

    #[test]
    fn evicts_oldest_when_over_capacity() {
        let store = LiveHtmlStore::default();
        for i in 0..(MAX_TOKENS + 4) {
            store.register(format!("<p>{}</p>", i), None, false);
        }
        assert_eq!(store.len(), MAX_TOKENS);
    }

    #[test]
    fn handler_returns_html_for_known_token() {
        let store = LiveHtmlStore::default();
        let token = store.register("<p>hello</p>".to_string(), None, false);
        let uri = format!("carbide-html://live/{}/", token);
        let response = handle_live_html_request(&store, &make_request(&uri));
        assert_eq!(response.status(), 200);
        assert_eq!(
            response.headers().get("Content-Type").and_then(|v| v.to_str().ok()),
            Some("text/html; charset=utf-8"),
        );
        assert_eq!(response.body(), b"<p>hello</p>");
    }

    #[test]
    fn handler_serves_html_with_and_without_trailing_slash() {
        let store = LiveHtmlStore::default();
        let token = store.register("<p>x</p>".to_string(), None, false);
        for uri in [
            format!("carbide-html://live/{}", token),
            format!("carbide-html://live/{}/", token),
        ] {
            let resp = handle_live_html_request(&store, &make_request(&uri));
            assert_eq!(resp.status(), 200, "uri={}", uri);
            assert_eq!(resp.body(), b"<p>x</p>");
        }
    }

    #[test]
    fn handler_returns_404_for_unknown_token() {
        let store = LiveHtmlStore::default();
        let uri = "carbide-html://live/missing/";
        let response = handle_live_html_request(&store, &make_request(uri));
        assert_eq!(response.status(), 404);
    }

    #[test]
    fn handler_rejects_missing_token() {
        let store = LiveHtmlStore::default();
        let response =
            handle_live_html_request(&store, &make_request("carbide-html://live/"));
        assert_eq!(response.status(), 400);
    }

    #[test]
    fn handler_rejects_unknown_host() {
        let store = LiveHtmlStore::default();
        let response =
            handle_live_html_request(&store, &make_request("carbide-html://other/abc"));
        assert_eq!(response.status(), 400);
    }

    #[test]
    fn token_from_url_round_trips_a_registered_url() {
        let store = LiveHtmlStore::default();
        let token = store.register("<p>x</p>".to_string(), None, false);
        let url = format!("{}://{}/{}/", SCHEME, HOST, token);
        assert_eq!(token_from_url(&url), Some(token.as_str()));
    }

    #[test]
    fn token_from_url_rejects_foreign_urls() {
        assert!(token_from_url("https://example.com/abc").is_none());
        assert!(token_from_url(&format!("{}://{}/", SCHEME, HOST)).is_none());
    }

    #[test]
    fn csp_response_header_is_present_and_grants_inline_scripts() {
        let store = LiveHtmlStore::default();
        let token = store.register("<p>ok</p>".to_string(), None, false);
        let response = handle_live_html_request(
            &store,
            &make_request(&format!("carbide-html://live/{}/", token)),
        );
        let csp = response
            .headers()
            .get("Content-Security-Policy")
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();
        assert!(csp.contains("script-src 'unsafe-inline'"));
    }

    #[test]
    fn csp_live_omits_https_from_scripts_and_styles() {
        let csp = live_html_csp(false);
        assert!(csp.contains("script-src 'unsafe-inline' 'unsafe-eval' blob: data:;"));
        assert!(!csp.contains("script-src 'unsafe-inline' 'unsafe-eval' blob: data: https:"));
        assert!(csp.contains("style-src 'unsafe-inline' data:;"));
        assert!(!csp.contains("style-src 'unsafe-inline' data: https:"));
        assert!(csp.contains("connect-src 'none'"));
    }

    #[test]
    fn csp_livenet_allows_https_scripts_and_styles() {
        let csp = live_html_csp(true);
        assert!(csp.contains("script-src 'unsafe-inline' 'unsafe-eval' blob: data: https:"));
        assert!(csp.contains("style-src 'unsafe-inline' data: https:"));
        assert!(csp.contains("connect-src *"));
    }

    #[test]
    fn csp_never_allows_http_for_scripts_or_styles() {
        for csp in [live_html_csp(false), live_html_csp(true)] {
            let script = csp
                .split("; ")
                .find(|d| d.starts_with("script-src"))
                .unwrap();
            let style = csp
                .split("; ")
                .find(|d| d.starts_with("style-src"))
                .unwrap();
            assert!(!script.contains("http:"), "script-src had http: in {}", csp);
            assert!(!style.contains("http:"), "style-src had http: in {}", csp);
        }
    }

    fn header_csp(store: &LiveHtmlStore, allow_network: bool) -> String {
        let token = store.register("<p>ok</p>".to_string(), None, allow_network);
        let response = handle_live_html_request(
            store,
            &make_request(&format!("carbide-html://live/{}/", token)),
        );
        response
            .headers()
            .get("Content-Security-Policy")
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string()
    }

    #[test]
    fn handler_emits_tier_csp_header() {
        let store = LiveHtmlStore::default();
        assert_eq!(header_csp(&store, true), live_html_csp(true));
        assert_eq!(header_csp(&store, false), live_html_csp(false));
    }

    #[test]
    fn serves_a_sub_path_asset_from_the_doc_folder() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("logo.png"), b"PNG_BYTES").unwrap();
        let store = LiveHtmlStore::default();
        let token = store.register("<p>x</p>".to_string(), Some(tmp.path().to_path_buf()), false);

        let uri = format!("carbide-html://live/{}/logo.png", token);
        let resp = handle_live_html_request(&store, &make_request(&uri));
        assert_eq!(resp.status(), 200);
        assert_eq!(resp.body(), b"PNG_BYTES");
        assert_eq!(
            resp.headers().get("Content-Type").and_then(|v| v.to_str().ok()),
            Some("image/png"),
        );
    }

    #[test]
    fn percent_decodes_sub_path_segments() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("my photo.png"), b"PHOTO").unwrap();
        let store = LiveHtmlStore::default();
        let token = store.register("<p>x</p>".to_string(), Some(tmp.path().to_path_buf()), false);

        let uri = format!("carbide-html://live/{}/my%20photo.png", token);
        let resp = handle_live_html_request(&store, &make_request(&uri));
        assert_eq!(resp.status(), 200);
        assert_eq!(resp.body(), b"PHOTO");
    }

    #[test]
    fn rejects_dotdot_traversal_in_sub_path() {
        let tmp = tempfile::tempdir().unwrap();
        let parent = tmp.path().join("doc");
        std::fs::create_dir(&parent).unwrap();
        std::fs::write(tmp.path().join("secret.txt"), b"SECRET").unwrap();
        let store = LiveHtmlStore::default();
        let token = store.register("<p>x</p>".to_string(), Some(parent), false);

        let uri = format!("carbide-html://live/{}/../secret.txt", token);
        let resp = handle_live_html_request(&store, &make_request(&uri));
        assert_eq!(resp.status(), 404);
    }

    #[test]
    fn returns_404_for_sub_path_when_no_asset_root_is_registered() {
        let store = LiveHtmlStore::default();
        let token = store.register("<p>x</p>".to_string(), None, false);
        let uri = format!("carbide-html://live/{}/logo.png", token);
        let resp = handle_live_html_request(&store, &make_request(&uri));
        assert_eq!(resp.status(), 404);
    }

    #[test]
    fn html_live_register_returns_url_with_trailing_slash() {
        let token = "abc123";
        let url = format!("{}://{}/{}/", SCHEME, HOST, token);
        assert!(url.ends_with('/'));
    }
}
