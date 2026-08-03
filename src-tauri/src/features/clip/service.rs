use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, CONTENT_TYPE, USER_AGENT};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

use crate::features::notes::service::safe_vault_abs_for_write;
use crate::features::plugin::http_fetch::fetch_checked;
use crate::features::search::html_extractor::sniff_decode;
use crate::shared::epub::{build_epub, read_epub_images, EpubInput};
use crate::shared::{io_utils, storage};

const MAX_PAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_ASSET_BYTES: usize = 5 * 1024 * 1024;
const FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

// Bot-filtering CDNs (Cloudflare, Reddit, ...) reject non-browser user agents
// with 429/403, so clip fetches present a browser UA.
const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

fn browser_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(BROWSER_USER_AGENT));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static(
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        ),
    );
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
    headers
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ClipPage {
    pub final_url: String,
    pub html: String,
    pub content_type: String,
}

// "blocked" marks bot-protection rejections (403/429) that a webview capture
// window can likely get past; the frontend offers that fallback only for them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ClipFetchErrorKind {
    Blocked,
    Other,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ClipFetchError {
    pub kind: ClipFetchErrorKind,
    pub message: String,
}

impl ClipFetchError {
    fn other(message: impl Into<String>) -> Self {
        Self {
            kind: ClipFetchErrorKind::Other,
            message: message.into(),
        }
    }
}

impl From<String> for ClipFetchError {
    fn from(message: String) -> Self {
        Self::other(message)
    }
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ClipAsset {
    pub bytes: Vec<u8>,
    pub content_type: String,
}

#[tauri::command]
#[specta::specta]
pub async fn clip_fetch_page(url: String) -> Result<ClipPage, ClipFetchError> {
    let parsed =
        url::Url::parse(&url).map_err(|e| ClipFetchError::other(format!("Invalid URL: {e}")))?;
    let response = fetch_checked(
        reqwest::Method::GET,
        parsed,
        browser_headers(),
        None,
        FETCH_TIMEOUT,
    )
    .await?;

    if !response.status().is_success() {
        return Err(status_error(response.status()));
    }

    let final_url = response.url().to_string();
    let content_type = response_content_type(response.headers());
    let mime = mime_essence(&content_type);
    if !(mime.is_empty() || mime == "text/html" || mime == "application/xhtml+xml") {
        return Err(ClipFetchError::other(format!(
            "Unsupported content type: {mime}"
        )));
    }

    check_declared_length(&response, MAX_PAGE_BYTES, "Page")?;
    let bytes = response
        .bytes()
        .await
        .map_err(|e| ClipFetchError::other(format!("Failed to read response body: {e}")))?;
    check_page_size(bytes.len())?;

    Ok(ClipPage {
        final_url,
        html: decode_page(&bytes, &content_type),
        content_type: mime,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn clip_fetch_asset(url: String) -> Result<ClipAsset, String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
    let response = fetch_checked(
        reqwest::Method::GET,
        parsed,
        browser_headers(),
        None,
        FETCH_TIMEOUT,
    )
    .await?;

    if !response.status().is_success() {
        return Err(status_error(response.status()).message);
    }

    let content_type = response_content_type(response.headers());
    let mime = mime_essence(&content_type);

    check_declared_length(&response, MAX_ASSET_BYTES, "Asset")?;
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;
    if bytes.len() > MAX_ASSET_BYTES {
        return Err(format!("Asset exceeds {MAX_ASSET_BYTES} byte limit"));
    }

    let mime = if mime.starts_with("image/") {
        mime
    } else {
        sniff_image_mime(&bytes)
            .ok_or_else(|| format!("Not an image: content type {mime}"))?
            .to_string()
    };

    Ok(ClipAsset {
        bytes: bytes.to_vec(),
        content_type: mime,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn clip_write_epub(
    vault_id: String,
    epub_path: String,
    input: EpubInput,
    app: AppHandle,
) -> Result<(), String> {
    crate::shared::blocking::blocking("clip_write_epub", move || {
        clip_write_epub_inner(vault_id, epub_path, input, app)
    })
    .await
}

pub fn clip_write_epub_inner(
    vault_id: String,
    epub_path: String,
    input: EpubInput,
    app: AppHandle,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = safe_vault_abs_for_write(&root, &epub_path)?;
    let images = read_epub_images(&root, &input.images)?;
    let epub = build_epub(&input, &images)?;
    io_utils::atomic_write(&abs, epub)
}

// Anti-bot CDNs (Cloudflare, archive.ph, ...) answer non-interactive clients
// with 403/429 CAPTCHA interstitials regardless of headers, so those statuses
// usually mean "blocked", not "retry later".
fn status_error(status: reqwest::StatusCode) -> ClipFetchError {
    match status.as_u16() {
        403 | 429 => ClipFetchError {
            kind: ClipFetchErrorKind::Blocked,
            message: format!(
                "Site blocked the request ({status}). It likely requires an interactive \
                 browser (CAPTCHA / bot protection), so it cannot be clipped directly."
            ),
        },
        _ => ClipFetchError::other(format!("Request failed with status {status}")),
    }
}

pub(crate) fn check_page_size(len: usize) -> Result<(), String> {
    if len > MAX_PAGE_BYTES {
        return Err(format!("Page exceeds {MAX_PAGE_BYTES} byte limit"));
    }
    Ok(())
}

fn check_declared_length(
    response: &reqwest::Response,
    cap: usize,
    label: &str,
) -> Result<(), String> {
    match response.content_length() {
        Some(length) if length > cap as u64 => Err(format!("{label} exceeds {cap} byte limit")),
        _ => Ok(()),
    }
}

fn response_content_type(headers: &HeaderMap) -> String {
    headers
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string()
}

fn mime_essence(content_type: &str) -> String {
    content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

fn charset_from_content_type(content_type: &str) -> Option<String> {
    content_type.split(';').skip(1).find_map(|param| {
        let mut parts = param.splitn(2, '=');
        let key = parts.next()?.trim().to_ascii_lowercase();
        if key != "charset" {
            return None;
        }
        Some(parts.next()?.trim().trim_matches('"').to_string())
    })
}

fn decode_page(bytes: &[u8], content_type: &str) -> String {
    if let Some(charset) = charset_from_content_type(content_type) {
        if let Some(encoding) = encoding_rs::Encoding::for_label(charset.as_bytes()) {
            let (decoded, _, had_errors) = encoding.decode(bytes);
            if !had_errors {
                return decoded.into_owned();
            }
        }
    }
    sniff_decode(bytes)
}

fn sniff_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_latin1_page_via_charset_param() {
        let bytes = b"caf\xe9";
        let decoded = decode_page(bytes, "text/html; charset=iso-8859-1");
        assert_eq!(decoded, "café");
    }

    #[test]
    fn decodes_utf8_page_without_charset() {
        let decoded = decode_page("café".as_bytes(), "text/html");
        assert_eq!(decoded, "café");
    }

    #[test]
    fn extracts_charset_with_quotes_and_case() {
        assert_eq!(
            charset_from_content_type("text/html; Charset=\"UTF-8\""),
            Some("UTF-8".to_string())
        );
        assert_eq!(charset_from_content_type("text/html"), None);
    }

    #[test]
    fn status_error_explains_bot_blocks() {
        let blocked = status_error(reqwest::StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(blocked.kind, ClipFetchErrorKind::Blocked);
        assert!(blocked.message.contains("429"));
        assert!(blocked.message.contains("bot protection"));
        let forbidden = status_error(reqwest::StatusCode::FORBIDDEN);
        assert_eq!(forbidden.kind, ClipFetchErrorKind::Blocked);
        assert!(forbidden.message.contains("bot protection"));
        let not_found = status_error(reqwest::StatusCode::NOT_FOUND);
        assert_eq!(not_found.kind, ClipFetchErrorKind::Other);
        assert_eq!(not_found.message, "Request failed with status 404 Not Found");
    }

    #[test]
    fn fetch_error_serializes_snake_case_kind() {
        let json = serde_json::to_string(&status_error(reqwest::StatusCode::FORBIDDEN)).unwrap();
        assert!(json.contains("\"kind\":\"blocked\""));
    }

    #[test]
    fn sniffs_image_magic_bytes() {
        assert_eq!(
            sniff_image_mime(b"\x89PNG\r\n\x1a\nrest"),
            Some("image/png")
        );
        assert_eq!(
            sniff_image_mime(&[0xFF, 0xD8, 0xFF, 0xE0]),
            Some("image/jpeg")
        );
        assert_eq!(sniff_image_mime(b"GIF89a-rest"), Some("image/gif"));
        assert_eq!(
            sniff_image_mime(b"RIFF\x00\x00\x00\x00WEBPVP8 "),
            Some("image/webp")
        );
        assert_eq!(sniff_image_mime(b"<html></html>"), None);
    }
}
