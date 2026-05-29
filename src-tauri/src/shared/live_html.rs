use std::cell::Cell;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::http::{Request, Response};

const SCHEME: &str = "carbide-html";
const HOST: &str = "live";
const MAX_TOKENS: usize = 64;

thread_local! {
    static TOKEN_COUNTER: Cell<u64> = const { Cell::new(0) };
}

#[derive(Default)]
pub struct LiveHtmlStore {
    docs: Mutex<HashMap<String, Vec<u8>>>,
}

impl LiveHtmlStore {
    pub fn register(&self, html: String) -> String {
        let token = new_token();
        let mut docs = self.docs.lock().expect("live_html docs lock poisoned");
        if docs.len() >= MAX_TOKENS {
            evict_oldest(&mut docs);
        }
        docs.insert(token.clone(), html.into_bytes());
        token
    }

    pub fn release(&self, token: &str) {
        let mut docs = self.docs.lock().expect("live_html docs lock poisoned");
        docs.remove(token);
    }

    pub fn get(&self, token: &str) -> Option<Vec<u8>> {
        let docs = self.docs.lock().expect("live_html docs lock poisoned");
        docs.get(token).cloned()
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.docs
            .lock()
            .expect("live_html docs lock poisoned")
            .len()
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

fn evict_oldest(docs: &mut HashMap<String, Vec<u8>>) {
    if let Some(key) = docs.keys().next().cloned() {
        docs.remove(&key);
    }
}

pub fn live_html_csp() -> &'static str {
    "default-src 'none'; \
     script-src 'unsafe-inline' 'unsafe-eval' blob: data:; \
     style-src 'unsafe-inline' data:; \
     img-src data: blob: https: http:; \
     font-src data: https: http:; \
     media-src data: blob: https: http:; \
     connect-src *; \
     frame-src data: blob:"
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

    let parts: Vec<&str> = rel.splitn(2, '/').collect();
    if parts.is_empty() || parts[0] != HOST {
        return error_response(&uri, 400, "unknown live-html namespace");
    }
    if parts.len() < 2 || parts[1].is_empty() {
        return error_response(&uri, 400, "missing token");
    }
    let token = parts[1].split('?').next().unwrap_or("").trim_end_matches('/');
    if token.is_empty() {
        return error_response(&uri, 400, "empty token");
    }

    match store.get(token) {
        Some(bytes) => build_response(200, bytes),
        None => error_response(&uri, 404, "live-html token not found"),
    }
}

fn build_response(status: u16, body: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Content-Length", body.len().to_string())
        .header("Cache-Control", "no-store")
        .header("Content-Security-Policy", live_html_csp())
        .header("X-Frame-Options", "SAMEORIGIN")
        .body(body)
        .unwrap_or_else(|error| {
            log::error!("Failed to build live-html response: {}", error);
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
pub fn html_live_register(state: tauri::State<LiveHtmlStore>, html: String) -> String {
    let token = state.register(html);
    format!("{}://{}/{}", SCHEME, HOST, token)
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
    let token = token.trim_end_matches('/');
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
        let token = store.register(html.clone());
        assert_eq!(store.len(), 1);
        assert_eq!(store.get(&token).map(String::from_utf8), Some(Ok(html)));

        store.release(&token);
        assert_eq!(store.len(), 0);
        assert!(store.get(&token).is_none());
    }

    #[test]
    fn each_register_returns_a_distinct_token() {
        let store = LiveHtmlStore::default();
        let a = store.register("<p>a</p>".to_string());
        let b = store.register("<p>b</p>".to_string());
        assert_ne!(a, b);
    }

    #[test]
    fn evicts_oldest_when_over_capacity() {
        let store = LiveHtmlStore::default();
        for i in 0..(MAX_TOKENS + 4) {
            store.register(format!("<p>{}</p>", i));
        }
        assert_eq!(store.len(), MAX_TOKENS);
    }

    #[test]
    fn handler_returns_html_for_known_token() {
        let store = LiveHtmlStore::default();
        let token = store.register("<p>hello</p>".to_string());
        let uri = format!("carbide-html://live/{}", token);
        let response = handle_live_html_request(&store, &make_request(&uri));
        assert_eq!(response.status(), 200);
        assert_eq!(
            response.headers().get("Content-Type").and_then(|v| v.to_str().ok()),
            Some("text/html; charset=utf-8"),
        );
        assert_eq!(response.body(), b"<p>hello</p>");
    }

    #[test]
    fn handler_returns_404_for_unknown_token() {
        let store = LiveHtmlStore::default();
        let uri = "carbide-html://live/missing";
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
        let token = store.register("<p>x</p>".to_string());
        let url = format!("{}://{}/{}", SCHEME, HOST, token);
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
        let token = store.register("<p>ok</p>".to_string());
        let response = handle_live_html_request(
            &store,
            &make_request(&format!("carbide-html://live/{}", token)),
        );
        let csp = response
            .headers()
            .get("Content-Security-Policy")
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default();
        assert!(csp.contains("script-src 'unsafe-inline'"));
    }
}
