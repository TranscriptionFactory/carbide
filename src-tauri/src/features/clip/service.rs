use reqwest::header::{HeaderMap, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::io::Write;
use tauri::AppHandle;

use crate::features::notes::service::{safe_vault_abs, safe_vault_abs_for_write};
use crate::features::plugin::http_fetch::fetch_checked;
use crate::features::search::html_extractor::sniff_decode;
use crate::shared::{io_utils, storage};

const MAX_PAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_ASSET_BYTES: usize = 5 * 1024 * 1024;
const FETCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ClipPage {
    pub final_url: String,
    pub html: String,
    pub content_type: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ClipAsset {
    pub bytes: Vec<u8>,
    pub content_type: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ClipEpubImage {
    pub href: String,
    pub asset_path: String,
    pub media_type: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct ClipEpubInput {
    pub title: String,
    pub source_url: String,
    pub clipped_at: String,
    pub xhtml: String,
    pub images: Vec<ClipEpubImage>,
}

#[tauri::command]
#[specta::specta]
pub async fn clip_fetch_page(url: String) -> Result<ClipPage, String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
    let response = fetch_checked(
        reqwest::Method::GET,
        parsed,
        HeaderMap::new(),
        None,
        FETCH_TIMEOUT,
    )
    .await?;

    if !response.status().is_success() {
        return Err(format!("Request failed with status {}", response.status()));
    }

    let final_url = response.url().to_string();
    let content_type = response_content_type(response.headers());
    let mime = mime_essence(&content_type);
    if !(mime.is_empty() || mime == "text/html" || mime == "application/xhtml+xml") {
        return Err(format!("Unsupported content type: {mime}"));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;
    if bytes.len() > MAX_PAGE_BYTES {
        return Err(format!("Page exceeds {MAX_PAGE_BYTES} byte limit"));
    }

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
        HeaderMap::new(),
        None,
        FETCH_TIMEOUT,
    )
    .await?;

    if !response.status().is_success() {
        return Err(format!("Request failed with status {}", response.status()));
    }

    let content_type = response_content_type(response.headers());
    let mime = mime_essence(&content_type);

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
pub fn clip_write_epub(
    vault_id: String,
    epub_path: String,
    input: ClipEpubInput,
    app: AppHandle,
) -> Result<(), String> {
    let root = storage::vault_path(&app, &vault_id)?;
    let abs = safe_vault_abs_for_write(&root, &epub_path)?;

    let mut images: Vec<(&ClipEpubImage, Vec<u8>)> = Vec::new();
    for image in &input.images {
        let image_abs = safe_vault_abs(&root, &image.asset_path)?;
        let bytes = std::fs::read(&image_abs)
            .map_err(|e| format!("Failed to read asset {}: {e}", image.asset_path))?;
        images.push((image, bytes));
    }

    let epub = build_epub(&input, &images)?;
    io_utils::atomic_write(&abs, epub)
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

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn epub_timestamp(clipped_at: &str) -> String {
    match clipped_at.split_once('.') {
        Some((prefix, _)) => format!("{prefix}Z"),
        None => clipped_at.to_string(),
    }
}

const CONTAINER_XML: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"#;

fn build_opf(input: &ClipEpubInput, images: &[(&ClipEpubImage, Vec<u8>)]) -> String {
    let title = xml_escape(&input.title);
    let source = xml_escape(&input.source_url);
    let modified = epub_timestamp(&input.clipped_at);
    let manifest_images: String = images
        .iter()
        .enumerate()
        .map(|(i, (image, _))| {
            format!(
                "    <item id=\"img-{i}\" href=\"{}\" media-type=\"{}\"/>\n",
                xml_escape(&image.href),
                xml_escape(&image.media_type)
            )
        })
        .collect();

    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">{source}</dc:identifier>
    <dc:title>{title}</dc:title>
    <dc:language>en</dc:language>
    <dc:source>{source}</dc:source>
    <dc:date>{modified}</dc:date>
    <meta property="dcterms:modified">{modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
{manifest_images}  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>
"#
    )
}

fn build_nav(title: &str) -> String {
    let title = xml_escape(title);
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>{title}</title></head>
<body>
  <nav epub:type="toc">
    <ol><li><a href="content.xhtml">{title}</a></li></ol>
  </nav>
</body>
</html>
"#
    )
}

fn build_epub(
    input: &ClipEpubInput,
    images: &[(&ClipEpubImage, Vec<u8>)],
) -> Result<Vec<u8>, String> {
    use zip::write::SimpleFileOptions;

    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let deflated =
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let err = |e: zip::result::ZipError| format!("Failed to build EPUB: {e}");
    let io_err = |e: std::io::Error| format!("Failed to build EPUB: {e}");

    zip.start_file("mimetype", stored).map_err(err)?;
    zip.write_all(b"application/epub+zip").map_err(io_err)?;

    zip.start_file("META-INF/container.xml", deflated)
        .map_err(err)?;
    zip.write_all(CONTAINER_XML.as_bytes()).map_err(io_err)?;

    zip.start_file("OEBPS/content.opf", deflated).map_err(err)?;
    zip.write_all(build_opf(input, images).as_bytes())
        .map_err(io_err)?;

    zip.start_file("OEBPS/nav.xhtml", deflated).map_err(err)?;
    zip.write_all(build_nav(&input.title).as_bytes())
        .map_err(io_err)?;

    zip.start_file("OEBPS/content.xhtml", deflated)
        .map_err(err)?;
    zip.write_all(input.xhtml.as_bytes()).map_err(io_err)?;

    for (image, bytes) in images {
        zip.start_file(format!("OEBPS/{}", image.href), stored)
            .map_err(err)?;
        zip.write_all(bytes).map_err(io_err)?;
    }

    let cursor = zip.finish().map_err(err)?;
    Ok(cursor.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::search::epub_extractor::extract_epub_text;

    fn sample_input() -> ClipEpubInput {
        ClipEpubInput {
            title: "Clipped Article".to_string(),
            source_url: "https://example.com/post?a=1&b=2".to_string(),
            clipped_at: "2026-07-20T12:34:56.789Z".to_string(),
            xhtml: r#"<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Clipped Article</title></head>
<body><h1>Clipped Article</h1><p>Readable body text survives the roundtrip.</p>
<img src="images/img-0.png" alt=""/></body>
</html>
"#
            .to_string(),
            images: vec![],
        }
    }

    #[test]
    fn epub_roundtrips_through_extractor() {
        let input = sample_input();
        let png = b"\x89PNG\r\n\x1a\nfakebytes".to_vec();
        let image = ClipEpubImage {
            href: "images/img-0.png".to_string(),
            asset_path: ".assets/img-0.png".to_string(),
            media_type: "image/png".to_string(),
        };
        let epub = build_epub(&input, &[(&image, png)]).unwrap();

        let extraction = extract_epub_text(&epub);
        assert_eq!(extraction.title.as_deref(), Some("Clipped Article"));
        assert!(extraction
            .body
            .contains("Readable body text survives the roundtrip."));
    }

    #[test]
    fn opf_escapes_xml_special_chars() {
        let mut input = sample_input();
        input.title = "Clipped <Article> & More".to_string();
        let opf = build_opf(&input, &[]);
        assert!(opf.contains("<dc:title>Clipped &lt;Article&gt; &amp; More</dc:title>"));
        assert!(opf.contains("<dc:source>https://example.com/post?a=1&amp;b=2</dc:source>"));
    }

    #[test]
    fn epub_mimetype_is_first_and_stored() {
        let epub = build_epub(&sample_input(), &[]).unwrap();
        assert_eq!(&epub[0..4], b"PK\x03\x04");
        // Local file header: compression method at offset 8, filename at offset 30.
        assert_eq!(&epub[8..10], &[0u8, 0u8], "mimetype must be Stored");
        assert_eq!(&epub[30..38], b"mimetype");
        assert_eq!(&epub[38..58], b"application/epub+zip");
    }

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
    fn sniffs_image_magic_bytes() {
        assert_eq!(
            sniff_image_mime(b"\x89PNG\r\n\x1a\nrest"),
            Some("image/png")
        );
        assert_eq!(sniff_image_mime(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(sniff_image_mime(b"GIF89a-rest"), Some("image/gif"));
        assert_eq!(sniff_image_mime(b"RIFF\x00\x00\x00\x00WEBPVP8 "), Some("image/webp"));
        assert_eq!(sniff_image_mime(b"<html></html>"), None);
    }
}
