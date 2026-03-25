use rayon::prelude::*;
use regex::Regex;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::LazyLock;
use std::time::Duration;
use walkdir::WalkDir;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ScanEntry {
    pub file_path: String,
    pub file_name: String,
    pub file_type: String,
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub doi: Option<String>,
    pub creation_date: Option<String>,
    pub body_text: String,
    pub page_offsets: Vec<usize>,
    pub modified_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LinkedSourceFileInfo {
    pub file_path: String,
    pub modified_at: u64,
}

// ---------------------------------------------------------------------------
// File classification
// ---------------------------------------------------------------------------

fn classify_linked_file(path: &Path) -> Option<&'static str> {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "pdf" => Some("pdf"),
        "html" | "htm" => Some("html"),
        _ => None,
    }
}

fn is_supported_extension(path: &Path) -> bool {
    classify_linked_file(path).is_some()
}

// ---------------------------------------------------------------------------
// PDF metadata extraction via lopdf
// ---------------------------------------------------------------------------

fn extract_pdf_info_string(doc: &lopdf::Document, key: &[u8]) -> Option<String> {
    let trailer = &doc.trailer;
    let info_ref = trailer.get(b"Info").ok()?;
    let info_ref = match info_ref {
        lopdf::Object::Reference(r) => *r,
        _ => return None,
    };
    let info_dict = doc.get_dictionary(info_ref).ok()?;
    let val = info_dict.get(key).ok()?;
    match val {
        lopdf::Object::String(bytes, _) => {
            // Try UTF-16BE (BOM: FE FF), else treat as latin1/UTF-8
            if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                let chars: Vec<u16> = bytes[2..]
                    .chunks(2)
                    .filter_map(|c| {
                        if c.len() == 2 {
                            Some(u16::from_be_bytes([c[0], c[1]]))
                        } else {
                            None
                        }
                    })
                    .collect();
                String::from_utf16(&chars).ok()
            } else {
                Some(String::from_utf8_lossy(bytes).into_owned())
            }
        }
        _ => None,
    }
}

fn extract_pdf_metadata(path: &Path) -> (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) {
    let doc = match lopdf::Document::load(path) {
        Ok(d) => d,
        Err(_) => return (None, None, None, None, None),
    };
    let title = extract_pdf_info_string(&doc, b"Title").filter(|s| !s.trim().is_empty());
    let author = extract_pdf_info_string(&doc, b"Author").filter(|s| !s.trim().is_empty());
    let subject = extract_pdf_info_string(&doc, b"Subject").filter(|s| !s.trim().is_empty());
    let keywords = extract_pdf_info_string(&doc, b"Keywords").filter(|s| !s.trim().is_empty());
    let creation_date = extract_pdf_info_string(&doc, b"CreationDate").filter(|s| !s.trim().is_empty());
    (title, author, subject, keywords, creation_date)
}

// ---------------------------------------------------------------------------
// DOI extraction from text
// ---------------------------------------------------------------------------

static DOI_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"10\.\d{4,}/[^\s\]>)]+").unwrap());

fn extract_doi_from_text(text: &str, max_chars: usize) -> Option<String> {
    let search_text: &str = if text.len() > max_chars {
        let mut end = max_chars;
        while end > 0 && !text.is_char_boundary(end) {
            end -= 1;
        }
        &text[..end]
    } else {
        text
    };
    let m = DOI_REGEX.find(search_text)?;
    let doi = m.as_str().trim_end_matches(|c: char| c == '.' || c == ',');
    Some(doi.to_string())
}

// ---------------------------------------------------------------------------
// PDF text extraction (reuse pdf-extract)
// ---------------------------------------------------------------------------

const MAX_INDEXABLE_BYTES: usize = 512 * 1024;
const MAX_PDF_BYTES: usize = 100 * 1024 * 1024; // 100 MB
const PDF_EXTRACT_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Deserialize)]
struct PdfTextResult {
    text: String,
    offsets: Vec<usize>,
}

/// Extract PDF text in a subprocess to isolate OOM from pdf_extract::make_font().
/// If the subprocess crashes (OOM on malformed fonts), only it dies — the app survives.
fn extract_pdf_text_subprocess(path: &Path) -> Result<(String, Vec<usize>), String> {
    let file_len = std::fs::metadata(path)
        .map(|m| m.len())
        .unwrap_or(0);
    if file_len > MAX_PDF_BYTES as u64 {
        return Err(format!(
            "PDF too large for text extraction ({} MB, limit {} MB)",
            file_len / (1024 * 1024),
            MAX_PDF_BYTES / (1024 * 1024)
        ));
    }

    let exe = std::env::current_exe()
        .map_err(|e| format!("current_exe: {e}"))?;

    let mut child = std::process::Command::new(exe)
        .arg("--extract-pdf-text")
        .arg(path.as_os_str())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn extraction subprocess: {e}"))?;

    // Wait with timeout to prevent hanging on degenerate PDFs
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        std::thread::sleep(PDF_EXTRACT_TIMEOUT);
        let _ = tx.send(());
    });

    let output = loop {
        match child.try_wait() {
            Ok(Some(_status)) => break child.wait_with_output(),
            Ok(None) => {
                if rx.try_recv().is_ok() {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("PDF text extraction timed out".to_string());
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(format!("wait: {e}")),
        }
    }
    .map_err(|e| format!("wait_with_output: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PDF extraction subprocess failed: {stderr}"));
    }

    let result: PdfTextResult = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("parse extraction result: {e}"))?;

    Ok((result.text, result.offsets))
}

/// Entry point for the --extract-pdf-text subprocess mode.
/// Extracts text from a PDF and writes JSON to stdout, then exits.
pub fn run_extract_pdf_text(file_path: &str) {
    let bytes = match std::fs::read(file_path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("read {file_path}: {e}");
            std::process::exit(1);
        }
    };

    let pages = match pdf_extract::extract_text_from_mem_by_pages(&bytes) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("PDF text extraction: {e}");
            std::process::exit(1);
        }
    };

    let mut body = String::new();
    let mut offsets = Vec::with_capacity(pages.len());
    for page_text in &pages {
        offsets.push(body.len());
        body.push_str(page_text);
        body.push('\n');
    }
    if body.len() > MAX_INDEXABLE_BYTES {
        let mut end = MAX_INDEXABLE_BYTES;
        while end > 0 && !body.is_char_boundary(end) {
            end -= 1;
        }
        body.truncate(end);
    }

    let result = serde_json::json!({
        "text": body,
        "offsets": offsets
    });
    println!("{result}");
}

// ---------------------------------------------------------------------------
// HTML metadata extraction
// ---------------------------------------------------------------------------

fn extract_html_meta(content: &str, name: &str) -> Option<String> {
    // ascii_lowercase preserves byte offsets (only ASCII bytes change)
    let lower = content.to_ascii_lowercase();
    let pattern = format!("name=\"{}\"", name);
    let pos = lower.find(&pattern)?;
    let end = std::cmp::min(pos + 500, content.len());
    if !content.is_char_boundary(pos) || !content.is_char_boundary(end) {
        return None;
    }
    let region = &content[pos..end];
    let content_start = region.find("content=\"")? + 9;
    let content_end = region[content_start..].find('"')?;
    let value = region[content_start..content_start + content_end].to_string();
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn extract_html_title(content: &str) -> Option<String> {
    let lower = content.to_ascii_lowercase();
    let start = lower.find("<title")?;
    if !content.is_char_boundary(start) {
        return None;
    }
    let tag_end = content[start..].find('>')? + start + 1;
    if !content.is_char_boundary(tag_end) {
        return None;
    }
    let close = lower[tag_end..].find("</title")?;
    let title = content[tag_end..tag_end + close].trim().to_string();
    if title.is_empty() { None } else { Some(title) }
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    // ascii_lowercase preserves byte length and boundaries
    let lower = html.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    let len = bytes.len();

    let mut i = 0;
    while i < len {
        if bytes[i] == b'<'
            && (lower[i..].starts_with("<script") || lower[i..].starts_with("<style"))
        {
            let is_script = lower[i..].starts_with("<script");
            let end_tag = if is_script { "</script>" } else { "</style>" };
            if let Some(close_pos) = lower[i..].find(end_tag) {
                i += close_pos + end_tag.len();
                result.push(' ');
            } else {
                while i < len && bytes[i] != b'>' {
                    i += 1;
                }
                if i < len {
                    i += 1;
                }
                result.push(' ');
            }
        } else if bytes[i] == b'<' {
            while i < len && bytes[i] != b'>' {
                i += 1;
            }
            if i < len {
                i += 1;
            }
            result.push(' ');
        } else {
            // Properly handle multi-byte UTF-8 characters
            if html.is_char_boundary(i) {
                let ch = html[i..].chars().next().unwrap();
                result.push(ch);
                i += ch.len_utf8();
            } else {
                i += 1;
            }
        }
    }
    if result.len() > MAX_INDEXABLE_BYTES {
        let mut end = MAX_INDEXABLE_BYTES;
        while end > 0 && !result.is_char_boundary(end) {
            end -= 1;
        }
        result.truncate(end);
    }
    result
}

// ---------------------------------------------------------------------------
// Per-file extraction dispatcher
// ---------------------------------------------------------------------------

fn file_modified_at(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64
        })
        .unwrap_or(0)
}

fn extract_pdf(path: &Path) -> Result<ScanEntry, String> {
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string();

    let (title, author, subject, keywords, creation_date) = extract_pdf_metadata(path);

    let (body_text, page_offsets) = extract_pdf_text_subprocess(path).unwrap_or_default();

    let doi = extract_doi_from_text(&body_text, 5000);

    Ok(ScanEntry {
        file_path: path.to_string_lossy().into_owned(),
        file_name,
        file_type: "pdf".to_string(),
        title,
        author,
        subject,
        keywords,
        doi,
        creation_date,
        body_text,
        page_offsets,
        modified_at: file_modified_at(path),
    })
}

fn extract_html(path: &Path) -> Result<ScanEntry, String> {
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string();

    let content =
        std::fs::read_to_string(path).map_err(|e| format!("read {}: {e}", path.display()))?;

    let title = extract_html_title(&content);
    let author = extract_html_meta(&content, "author");
    let keywords = extract_html_meta(&content, "keywords");
    let subject = extract_html_meta(&content, "description");
    let doi = extract_html_meta(&content, "citation_doi")
        .or_else(|| extract_doi_from_text(&content, 5000));

    let body_text = strip_html_tags(&content);

    Ok(ScanEntry {
        file_path: path.to_string_lossy().into_owned(),
        file_name,
        file_type: "html".to_string(),
        title,
        author,
        subject: subject,
        keywords,
        doi,
        creation_date: None,
        body_text,
        page_offsets: vec![],
        modified_at: file_modified_at(path),
    })
}

fn extract_file(path: &Path) -> Result<ScanEntry, String> {
    match classify_linked_file(path) {
        Some("pdf") => extract_pdf(path),
        Some("html") => extract_html(path),
        _ => Err(format!("unsupported file type: {}", path.display())),
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

fn scan_folder_sync(folder_path: &str) -> Result<Vec<ScanEntry>, String> {
    let root = PathBuf::from(folder_path);
    if !root.is_dir() {
        return Err(format!("not a directory: {folder_path}"));
    }

    let paths: Vec<PathBuf> = WalkDir::new(&root)
        .follow_links(false)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file() && is_supported_extension(e.path()))
        .map(|e| e.path().to_path_buf())
        .collect();

    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(4)
        .build()
        .map_err(|e| format!("rayon pool: {e}"))?;

    let entries: Vec<ScanEntry> = pool.install(|| {
        paths
            .par_iter()
            .filter_map(|path| match extract_file(path) {
                Ok(entry) => Some(entry),
                Err(e) => {
                    log::warn!("Skipping {}: {e}", path.display());
                    None
                }
            })
            .collect()
    });

    Ok(entries)
}

#[tauri::command]
#[specta::specta]
pub async fn linked_source_scan_folder(folder_path: String) -> Result<Vec<ScanEntry>, String> {
    tokio::task::spawn_blocking(move || scan_folder_sync(&folder_path))
        .await
        .map_err(|e| format!("spawn_blocking: {e}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn linked_source_extract_file(file_path: String) -> Result<ScanEntry, String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&file_path);
        if !path.is_file() {
            return Err(format!("not a file: {file_path}"));
        }
        extract_file(&path)
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn linked_source_list_files(
    folder_path: String,
) -> Result<Vec<LinkedSourceFileInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let root = PathBuf::from(&folder_path);
        if !root.is_dir() {
            return Err(format!("not a directory: {folder_path}"));
        }

        let entries: Vec<LinkedSourceFileInfo> = WalkDir::new(&root)
            .follow_links(false)
            .max_depth(3)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file() && is_supported_extension(e.path()))
            .filter_map(|e| {
                let path = e.path();
                let modified_at = path
                    .metadata()
                    .ok()?
                    .modified()
                    .ok()?
                    .duration_since(std::time::UNIX_EPOCH)
                    .ok()?
                    .as_secs();
                Some(LinkedSourceFileInfo {
                    file_path: path.to_string_lossy().into_owned(),
                    modified_at,
                })
            })
            .collect();

        Ok(entries)
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn classify_pdf_file() {
        assert_eq!(
            classify_linked_file(Path::new("paper.pdf")),
            Some("pdf")
        );
    }

    #[test]
    fn classify_html_file() {
        assert_eq!(
            classify_linked_file(Path::new("page.html")),
            Some("html")
        );
        assert_eq!(
            classify_linked_file(Path::new("page.htm")),
            Some("html")
        );
    }

    #[test]
    fn classify_unsupported() {
        assert_eq!(classify_linked_file(Path::new("image.png")), None);
        assert_eq!(classify_linked_file(Path::new("doc.docx")), None);
    }

    #[test]
    fn doi_extraction_basic() {
        let text = "This paper (DOI: 10.1234/test.5678) presents...";
        assert_eq!(
            extract_doi_from_text(text, 1000),
            Some("10.1234/test.5678".to_string())
        );
    }

    #[test]
    fn doi_extraction_trailing_punctuation() {
        let text = "See 10.1000/xyz123.";
        assert_eq!(
            extract_doi_from_text(text, 1000),
            Some("10.1000/xyz123".to_string())
        );
    }

    #[test]
    fn doi_extraction_none() {
        assert_eq!(extract_doi_from_text("no doi here", 1000), None);
    }

    #[test]
    fn html_title_extraction() {
        let html = "<html><head><title>Test Title</title></head><body></body></html>";
        assert_eq!(extract_html_title(html), Some("Test Title".to_string()));
    }

    #[test]
    fn html_title_missing() {
        let html = "<html><body>No title</body></html>";
        assert_eq!(extract_html_title(html), None);
    }

    #[test]
    fn html_meta_extraction() {
        let html = r#"<meta name="author" content="John Doe">"#;
        assert_eq!(
            extract_html_meta(html, "author"),
            Some("John Doe".to_string())
        );
    }

    #[test]
    fn html_meta_missing() {
        let html = "<html><body>nothing</body></html>";
        assert_eq!(extract_html_meta(html, "author"), None);
    }

    #[test]
    fn strip_tags_basic() {
        let html = "<p>Hello <b>world</b></p>";
        let text = strip_html_tags(html);
        assert!(text.contains("Hello"));
        assert!(text.contains("world"));
        assert!(!text.contains("<p>"));
    }

    #[test]
    fn strip_tags_removes_script() {
        let html = "<p>Before</p><script>alert('xss')</script><p>After</p>";
        let text = strip_html_tags(html);
        assert!(text.contains("Before"));
        assert!(text.contains("After"));
        assert!(!text.contains("alert"));
    }

    #[test]
    fn doi_extraction_utf8_boundary() {
        let text = "日本語テキスト 10.1234/test.5678 more text";
        assert_eq!(
            extract_doi_from_text(text, 10),
            None
        );
        assert_eq!(
            extract_doi_from_text(text, 100),
            Some("10.1234/test.5678".to_string())
        );
    }

    #[test]
    fn strip_tags_unclosed_script() {
        let html = "<p>Before</p><script>alert('xss')<p>After the script</p>";
        let text = strip_html_tags(html);
        assert!(text.contains("Before"), "Content before script should be preserved");
        assert!(text.contains("After the script"), "Content after unclosed script should be preserved");
    }

    #[test]
    fn extract_html_file() {
        let dir = tempfile::tempdir().unwrap();
        let html_path = dir.path().join("test.html");
        let mut f = std::fs::File::create(&html_path).unwrap();
        write!(
            f,
            r#"<html><head>
            <title>My Paper</title>
            <meta name="author" content="Jane Smith">
            <meta name="keywords" content="rust, testing">
            </head><body><p>Body text here.</p></body></html>"#
        )
        .unwrap();

        let entry = extract_file(&html_path).unwrap();
        assert_eq!(entry.file_type, "html");
        assert_eq!(entry.title, Some("My Paper".to_string()));
        assert_eq!(entry.author, Some("Jane Smith".to_string()));
        assert_eq!(entry.keywords, Some("rust, testing".to_string()));
        assert!(entry.body_text.contains("Body text here"));
    }

    #[test]
    fn extract_html_file_multibyte_utf8() {
        let dir = tempfile::tempdir().unwrap();
        let html_path = dir.path().join("utf8.html");
        std::fs::write(
            &html_path,
            "<html><head><title>Ünïcödé Tïtlé</title>\
             <meta name=\"author\" content=\"José García\">\
             </head><body><p>日本語テキスト with émojis 🎉</p></body></html>",
        )
        .unwrap();

        let entry = extract_file(&html_path).unwrap();
        assert_eq!(entry.title, Some("Ünïcödé Tïtlé".to_string()));
        assert_eq!(entry.author, Some("José García".to_string()));
        assert!(entry.body_text.contains("日本語テキスト"));
        assert!(entry.body_text.contains("🎉"));
    }

    #[test]
    fn scan_folder_filters_supported() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.html"), "<html><body>hello</body></html>").unwrap();
        std::fs::write(dir.path().join("b.txt"), "plain text").unwrap();
        std::fs::write(dir.path().join("c.png"), &[0xFF, 0xD8]).unwrap();

        let entries = scan_folder_sync(&dir.path().to_string_lossy()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].file_type, "html");
    }
}
