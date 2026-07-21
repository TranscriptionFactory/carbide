use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::OnceLock;

const MAX_REQUEST_BODY_BYTES: usize = 1_024 * 1_024; // 1 MB
const MAX_RESPONSE_BODY_BYTES: usize = 10 * 1_024 * 1_024; // 10 MB

#[derive(Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PluginHttpRequest {
    pub url: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,
    #[serde(default)]
    pub body: Option<String>,
}

fn default_method() -> String {
    "GET".to_string()
}

#[derive(Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PluginHttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub ok: bool,
}

// Redirects are followed manually in fetch_checked so every hop gets SSRF +
// DNS re-validation; reqwest's Policy::custom is sync and cannot await DNS.
fn no_redirect_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("Carbide-Plugin/1.0")
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("Failed to build HTTP client")
    })
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                || (v6.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

fn check_ssrf(url: &url::Url) -> Result<(), String> {
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("Unsupported URL scheme: {scheme}"));
    }

    let host = url.host().ok_or_else(|| "URL has no host".to_string())?;

    match &host {
        url::Host::Domain(domain) => {
            if *domain == "localhost" || domain.ends_with(".local") || domain.ends_with(".internal")
            {
                return Err("Request to localhost/local network is blocked".to_string());
            }
        }
        url::Host::Ipv4(ip) => {
            if is_private_ip(IpAddr::V4(*ip)) {
                return Err(format!("Request to private IP {ip} is blocked"));
            }
        }
        url::Host::Ipv6(ip) => {
            if is_private_ip(IpAddr::V6(*ip)) {
                return Err(format!("Request to private IP {ip} is blocked"));
            }
        }
    }

    Ok(())
}

const MAX_REDIRECT_HOPS: usize = 5;

fn next_redirect_url(current: &url::Url, location: &str) -> Result<url::Url, String> {
    current
        .join(location)
        .map_err(|e| format!("Invalid redirect location: {e}"))
}

async fn check_url_allowed(url: &url::Url) -> Result<(), String> {
    check_ssrf(url)?;
    if let Some(url::Host::Domain(domain)) = url.host() {
        let port = url.port_or_known_default().unwrap_or(443);
        resolve_and_check(domain, port).await?;
    }
    Ok(())
}

pub(crate) async fn fetch_checked(
    method: reqwest::Method,
    url: url::Url,
    headers: HeaderMap,
    body: Option<String>,
    timeout: std::time::Duration,
) -> Result<reqwest::Response, String> {
    let mut current = url;
    let mut method = method;
    let mut body = body;

    for _ in 0..=MAX_REDIRECT_HOPS {
        check_url_allowed(&current).await?;

        let mut req_builder = no_redirect_client()
            .request(method.clone(), current.clone())
            .headers(headers.clone())
            .timeout(timeout);
        if let Some(ref b) = body {
            req_builder = req_builder.body(b.clone());
        }

        let response = req_builder
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {e}"))?;

        if !response.status().is_redirection() {
            return Ok(response);
        }

        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| "Redirect response missing Location header".to_string())?;
        current = next_redirect_url(&current, location)?;
        if response.status() == reqwest::StatusCode::SEE_OTHER {
            method = reqwest::Method::GET;
            body = None;
        }
    }

    Err(format!("Redirect chain exceeded {MAX_REDIRECT_HOPS} hops"))
}

async fn resolve_and_check(host: &str, port: u16) -> Result<(), String> {
    let addr = format!("{host}:{port}");
    let resolved: Vec<std::net::SocketAddr> = tokio::net::lookup_host(&addr)
        .await
        .map_err(|e| format!("DNS resolution failed for {host}: {e}"))?
        .collect();

    if resolved.is_empty() {
        return Err(format!("DNS resolution returned no addresses for {host}"));
    }

    for sock_addr in &resolved {
        if is_private_ip(sock_addr.ip()) {
            return Err(format!(
                "DNS for {host} resolved to private IP {} — blocked",
                sock_addr.ip()
            ));
        }
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_http_fetch(request: PluginHttpRequest) -> Result<PluginHttpResponse, String> {
    let parsed_url = url::Url::parse(&request.url).map_err(|e| format!("Invalid URL: {e}"))?;

    if let Some(ref body) = request.body {
        if body.len() > MAX_REQUEST_BODY_BYTES {
            return Err(format!(
                "Request body exceeds {MAX_REQUEST_BODY_BYTES} byte limit"
            ));
        }
    }

    let method: reqwest::Method = request
        .method
        .parse()
        .map_err(|_| format!("Invalid HTTP method: {}", request.method))?;

    let mut headers = HeaderMap::new();
    if let Some(ref header_map) = request.headers {
        for (k, v) in header_map {
            let name = HeaderName::from_bytes(k.as_bytes())
                .map_err(|_| format!("Invalid header name: {k}"))?;
            let value =
                HeaderValue::from_str(v).map_err(|_| format!("Invalid header value for {k}"))?;
            headers.insert(name, value);
        }
    }

    let response = fetch_checked(
        method,
        parsed_url,
        headers,
        request.body,
        std::time::Duration::from_secs(30),
    )
    .await?;

    let status = response.status().as_u16();
    let ok = response.status().is_success();

    let resp_headers: HashMap<String, String> = response
        .headers()
        .iter()
        .filter_map(|(k, v)| v.to_str().ok().map(|val| (k.to_string(), val.to_string())))
        .collect();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;

    if bytes.len() > MAX_RESPONSE_BODY_BYTES {
        return Err(format!(
            "Response body exceeds {MAX_RESPONSE_BODY_BYTES} byte limit"
        ));
    }

    let body = String::from_utf8_lossy(&bytes).to_string();

    Ok(PluginHttpResponse {
        status,
        headers: resp_headers,
        body,
        ok,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_localhost() {
        let url = url::Url::parse("http://localhost:8080/api").unwrap();
        assert!(check_ssrf(&url).is_err());
    }

    #[test]
    fn blocks_private_ipv4() {
        for addr in &[
            "http://127.0.0.1",
            "http://10.0.0.1",
            "http://192.168.1.1",
            "http://172.16.0.1",
        ] {
            let url = url::Url::parse(addr).unwrap();
            assert!(check_ssrf(&url).is_err(), "Should block {addr}");
        }
    }

    #[test]
    fn blocks_loopback_ipv6() {
        let url = url::Url::parse("http://[::1]/api").unwrap();
        assert!(check_ssrf(&url).is_err());
    }

    #[test]
    fn blocks_file_scheme() {
        let url = url::Url::parse("file:///etc/passwd").unwrap();
        assert!(check_ssrf(&url).is_err());
    }

    #[test]
    fn allows_public_ip() {
        let url = url::Url::parse("https://8.8.8.8/dns-query").unwrap();
        assert!(check_ssrf(&url).is_ok());
    }

    #[test]
    fn allows_public_domain() {
        let url = url::Url::parse("https://api.example.com/v1").unwrap();
        assert!(check_ssrf(&url).is_ok());
    }

    #[test]
    fn blocks_dot_local() {
        let url = url::Url::parse("http://myhost.local/api").unwrap();
        assert!(check_ssrf(&url).is_err());
    }

    #[test]
    fn blocks_ipv6_unique_local_and_link_local() {
        for addr in &["http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[fe80::1]/"] {
            let url = url::Url::parse(addr).unwrap();
            assert!(check_ssrf(&url).is_err(), "{addr} should be blocked");
        }
    }

    #[test]
    fn allows_public_ipv6() {
        let url = url::Url::parse("http://[2606:4700::1111]/").unwrap();
        assert!(check_ssrf(&url).is_ok());
    }

    #[test]
    fn resolves_relative_redirect_location() {
        let current = url::Url::parse("https://example.com/a/b").unwrap();
        let next = next_redirect_url(&current, "/c/d").unwrap();
        assert_eq!(next.as_str(), "https://example.com/c/d");
        let next = next_redirect_url(&current, "e").unwrap();
        assert_eq!(next.as_str(), "https://example.com/a/e");
    }

    #[test]
    fn redirect_to_private_target_fails_ssrf_check() {
        let current = url::Url::parse("https://example.com/start").unwrap();
        let next = next_redirect_url(&current, "http://169.254.169.254/latest").unwrap();
        assert!(check_ssrf(&next).is_err());
    }
}
