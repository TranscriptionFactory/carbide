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

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("Carbide-Plugin/1.0")
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
        IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified(),
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
            if *domain == "localhost"
                || domain.ends_with(".local")
                || domain.ends_with(".internal")
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
    let parsed_url =
        url::Url::parse(&request.url).map_err(|e| format!("Invalid URL: {e}"))?;

    check_ssrf(&parsed_url)?;

    if let Some(url::Host::Domain(domain)) = parsed_url.host() {
        let port = parsed_url.port_or_known_default().unwrap_or(443);
        resolve_and_check(&domain, port).await?;
    }

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
            let value = HeaderValue::from_str(v)
                .map_err(|_| format!("Invalid header value for {k}"))?;
            headers.insert(name, value);
        }
    }

    let mut req_builder = http_client()
        .request(method, parsed_url)
        .headers(headers)
        .timeout(std::time::Duration::from_secs(30));

    if let Some(body) = request.body {
        req_builder = req_builder.body(body);
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;

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
        for addr in &["http://127.0.0.1", "http://10.0.0.1", "http://192.168.1.1", "http://172.16.0.1"] {
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
}
