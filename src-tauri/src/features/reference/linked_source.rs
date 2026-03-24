use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use regex::Regex;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
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

#[derive(Debug, Serialize, Clone, Type)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum LinkedSourceFsEvent {
    Added {
        folder_path: String,
        file_path: String,
    },
    Removed {
        folder_path: String,
        file_path: String,
    },
    Modified {
        folder_path: String,
        file_path: String,
    },
}

// ---------------------------------------------------------------------------
// Watcher state
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct LinkedSourceWatcherState {
    watchers: Arc<Mutex<HashMap<String, mpsc::Sender<()>>>>,
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

fn extract_doi_from_text(text: &str, max_chars: usize) -> Option<String> {
    let search_text: &str = if text.len() > max_chars {
        &text[..max_chars]
    } else {
        text
    };
    let re = Regex::new(r"10\.\d{4,}/[^\s\]>)]+").ok()?;
    let m = re.find(search_text)?;
    let doi = m.as_str().trim_end_matches(|c: char| c == '.' || c == ',');
    Some(doi.to_string())
}

// ---------------------------------------------------------------------------
// PDF text extraction (reuse pdf-extract)
// ---------------------------------------------------------------------------

const MAX_INDEXABLE_BYTES: usize = 512 * 1024;

fn extract_pdf_text(bytes: &[u8]) -> Result<(String, Vec<usize>), String> {
    let pages = pdf_extract::extract_text_from_mem_by_pages(bytes)
        .map_err(|e| format!("PDF text extraction: {e}"))?;
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
    Ok((body, offsets))
}

// ---------------------------------------------------------------------------
// HTML metadata extraction
// ---------------------------------------------------------------------------

fn extract_html_meta(content: &str, name: &str) -> Option<String> {
    let lower = content.to_lowercase();
    let pattern = format!("name=\"{}\"", name);
    let pos = lower.find(&pattern)?;
    let region = &content[pos..std::cmp::min(pos + 500, content.len())];
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
    let lower = content.to_lowercase();
    let start = lower.find("<title")? ;
    let tag_end = content[start..].find('>')? + start + 1;
    let close = lower[tag_end..].find("</title")?;
    let title = content[tag_end..tag_end + close].trim().to_string();
    if title.is_empty() { None } else { Some(title) }
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let lower = html.to_lowercase();
    let bytes = lower.as_bytes();
    let orig = html.as_bytes();
    let len = bytes.len();

    let mut i = 0;
    while i < len {
        // Check for <script or <style opening tags
        if bytes[i] == b'<'
            && (lower[i..].starts_with("<script") || lower[i..].starts_with("<style"))
        {
            let is_script = lower[i..].starts_with("<script");
            let end_tag = if is_script { "</script>" } else { "</style>" };
            // Skip to closing tag
            if let Some(close_pos) = lower[i..].find(end_tag) {
                i += close_pos + end_tag.len();
                result.push(' ');
            } else {
                // No closing tag found, skip rest
                break;
            }
        } else if bytes[i] == b'<' {
            // Skip regular tag
            while i < len && bytes[i] != b'>' {
                i += 1;
            }
            if i < len {
                i += 1; // skip '>'
            }
            result.push(' ');
        } else {
            result.push(orig[i] as char);
            i += 1;
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

    let bytes = std::fs::read(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let (body_text, page_offsets) = extract_pdf_text(&bytes).unwrap_or_default();

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

#[tauri::command]
#[specta::specta]
pub fn linked_source_scan_folder(folder_path: String) -> Result<Vec<ScanEntry>, String> {
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("not a directory: {folder_path}"));
    }

    let mut entries = Vec::new();
    for entry in WalkDir::new(&root)
        .follow_links(false)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() || !is_supported_extension(path) {
            continue;
        }
        match extract_file(path) {
            Ok(scan_entry) => entries.push(scan_entry),
            Err(e) => {
                log::warn!("Skipping {}: {e}", path.display());
            }
        }
    }

    Ok(entries)
}

#[tauri::command]
#[specta::specta]
pub fn linked_source_extract_file(file_path: String) -> Result<ScanEntry, String> {
    let path = PathBuf::from(&file_path);
    if !path.is_file() {
        return Err(format!("not a file: {file_path}"));
    }
    extract_file(&path)
}

#[tauri::command]
#[specta::specta]
pub fn linked_source_watch(
    app: AppHandle,
    state: State<LinkedSourceWatcherState>,
    folder_path: String,
) -> Result<(), String> {
    log::info!("Watching linked source: {folder_path}");
    let root = PathBuf::from(&folder_path);
    if !root.is_dir() {
        return Err(format!("not a directory: {folder_path}"));
    }

    let mut watchers = state
        .watchers
        .lock()
        .map_err(|_| "watcher lock poisoned")?;

    // Stop existing watcher for this folder if any
    if let Some(stop_tx) = watchers.remove(&folder_path) {
        let _ = stop_tx.send(());
    }

    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let folder_path_clone = folder_path.clone();

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<Result<notify::Event, notify::Error>>();

        let mut watcher = match RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(e) => {
                log::error!("Failed to create linked source watcher: {e}");
                return;
            }
        };

        if let Err(e) = watcher.watch(&root, RecursiveMode::Recursive) {
            log::error!("Failed to watch {}: {e}", root.display());
            return;
        }

        loop {
            if stop_rx.try_recv().is_ok() {
                break;
            }

            let res = match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(r) => r,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => break,
            };

            let event = match res {
                Ok(e) => e,
                Err(_) => continue,
            };

            for p in event.paths.iter() {
                if !is_supported_extension(p) {
                    continue;
                }

                let file_path_str = p.to_string_lossy().into_owned();
                let fs_event = match &event.kind {
                    EventKind::Create(_) => Some(LinkedSourceFsEvent::Added {
                        folder_path: folder_path_clone.clone(),
                        file_path: file_path_str,
                    }),
                    EventKind::Remove(_) => Some(LinkedSourceFsEvent::Removed {
                        folder_path: folder_path_clone.clone(),
                        file_path: file_path_str,
                    }),
                    EventKind::Modify(_) => Some(LinkedSourceFsEvent::Modified {
                        folder_path: folder_path_clone.clone(),
                        file_path: file_path_str,
                    }),
                    _ => None,
                };

                if let Some(evt) = fs_event {
                    let _ = app.emit("linked-source-fs-event", &evt);
                }
            }
        }
    });

    watchers.insert(folder_path, stop_tx);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn linked_source_unwatch(
    state: State<LinkedSourceWatcherState>,
    folder_path: String,
) -> Result<(), String> {
    log::info!("Unwatching linked source: {folder_path}");
    let mut watchers = state
        .watchers
        .lock()
        .map_err(|_| "watcher lock poisoned")?;
    if let Some(stop_tx) = watchers.remove(&folder_path) {
        let _ = stop_tx.send(());
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn linked_source_unwatch_all(
    state: State<LinkedSourceWatcherState>,
) -> Result<(), String> {
    log::info!("Unwatching all linked sources");
    let mut watchers = state
        .watchers
        .lock()
        .map_err(|_| "watcher lock poisoned")?;
    for (_, stop_tx) in watchers.drain() {
        let _ = stop_tx.send(());
    }
    Ok(())
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
    fn scan_folder_filters_supported() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.html"), "<html><body>hello</body></html>").unwrap();
        std::fs::write(dir.path().join("b.txt"), "plain text").unwrap();
        std::fs::write(dir.path().join("c.png"), &[0xFF, 0xD8]).unwrap();

        let entries = linked_source_scan_folder(dir.path().to_string_lossy().into_owned()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].file_type, "html");
    }
}
