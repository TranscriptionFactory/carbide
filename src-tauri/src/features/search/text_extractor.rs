use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::Path;
use std::sync::mpsc;
use std::sync::mpsc::RecvTimeoutError;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq)]
pub enum FileCategory {
    Markdown,
    Canvas,
    Pdf,
    Html,
    Epub,
    Code,
    Text,
    Binary,
}

impl FileCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Markdown => "markdown",
            Self::Canvas => "canvas",
            Self::Pdf => "pdf",
            Self::Html => "html",
            Self::Epub => "epub",
            Self::Code => "code",
            Self::Text => "text",
            Self::Binary => "binary",
        }
    }
}

pub struct ExtractedContent {
    pub category: FileCategory,
    pub title: Option<String>,
    pub body: String,
    pub page_offsets: Vec<usize>,
}

pub fn classify_file(path: &Path) -> FileCategory {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "md" => FileCategory::Markdown,
        "canvas" | "excalidraw" => FileCategory::Canvas,
        "pdf" => FileCategory::Pdf,
        "html" | "htm" => FileCategory::Html,
        "epub" => FileCategory::Epub,
        "py" | "r" | "rs" | "ts" | "js" | "jsx" | "tsx" | "json" | "yaml" | "yml" | "toml"
        | "sh" | "bash" | "css" | "scss" | "xml" | "sql" | "go" | "java" | "kt" | "c"
        | "cpp" | "h" | "hpp" | "cs" | "rb" | "lua" | "zig" | "swift" | "dart" | "ex" | "exs"
        | "erl" | "hs" | "ml" | "clj" | "scala" | "php" | "pl" | "vim" | "el" | "nix" | "dhall"
        | "tf" | "hcl" | "graphql" | "proto" | "svelte" | "vue" | "astro" => FileCategory::Code,
        "txt" | "log" | "ini" | "cfg" | "conf" | "env" | "csv" | "tsv" | "rst" | "adoc" | "org"
        | "diff" | "patch" | "properties" | "dockerfile" | "makefile" | "cmake" | "gitignore"
        | "gitattributes" | "editorconfig" => FileCategory::Text,
        _ => {
            if is_known_text_filename(path) {
                FileCategory::Text
            } else {
                FileCategory::Binary
            }
        }
    }
}

fn is_known_text_filename(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(
        name.as_str(),
        "dockerfile" | "makefile" | "rakefile" | "gemfile" | "procfile" | "justfile"
    )
}

pub(crate) const MAX_INDEXABLE_BYTES: usize = 512 * 1024; // 512 KB body cap for FTS

pub fn extract_content(path: &Path, bytes: &[u8]) -> ExtractedContent {
    let category = classify_file(path);
    match category {
        FileCategory::Markdown | FileCategory::Canvas => ExtractedContent {
            category,
            title: None,
            body: String::new(), // handled by existing pipelines
            page_offsets: vec![],
        },
        FileCategory::Pdf => {
            let (body, page_offsets) = extract_pdf_text(bytes).unwrap_or_else(|e| {
                log::warn!("PDF extraction failed for {}: {e}", path.display());
                Default::default()
            });
            ExtractedContent {
                category: FileCategory::Pdf,
                title: None,
                body,
                page_offsets,
            }
        }
        FileCategory::Html => {
            let extraction = crate::features::search::html_extractor::extract_html_text(bytes);
            ExtractedContent {
                category: FileCategory::Html,
                title: extraction.title,
                body: truncate_body(extraction.body),
                page_offsets: vec![],
            }
        }
        FileCategory::Epub => {
            let extraction = crate::features::search::epub_extractor::extract_epub_text(bytes);
            ExtractedContent {
                category: FileCategory::Epub,
                title: extraction.title,
                body: truncate_body(extraction.body),
                page_offsets: vec![],
            }
        }
        FileCategory::Code | FileCategory::Text => {
            let body = decode_text_body(bytes);
            ExtractedContent {
                category,
                title: None,
                body,
                page_offsets: vec![],
            }
        }
        FileCategory::Binary => ExtractedContent {
            category: FileCategory::Binary,
            title: None,
            body: String::new(),
            page_offsets: vec![],
        },
    }
}

const PDF_EXTRACT_TIMEOUT: Duration = Duration::from_secs(15);

fn extract_pdf_text(bytes: &[u8]) -> Result<(String, Vec<usize>), String> {
    let owned = bytes.to_vec();
    let (tx, rx) = mpsc::channel();

    std::thread::spawn(move || {
        let result = extract_pdf_pages_salvaged(&owned);
        let _ = tx.send(result);
    });

    let pages = match rx.recv_timeout(PDF_EXTRACT_TIMEOUT) {
        Ok(result) => result?,
        Err(RecvTimeoutError::Timeout) => return Err("extraction timed out".into()),
        Err(RecvTimeoutError::Disconnected) => return Err("extraction worker panicked".into()),
    };

    let mut body = String::new();
    let mut offsets = Vec::with_capacity(pages.len());
    for page_text in &pages {
        offsets.push(body.len());
        body.push_str(page_text);
        body.push('\n');
    }
    let body = truncate_body(body);
    Ok((body, offsets))
}

/// Load the PDF once, then extract text page-by-page so a panic on a single
/// unmappable glyph (pdf-extract panics internally on unknown glyph names)
/// drops only that page instead of the whole document.
pub(crate) fn extract_pdf_pages_salvaged(bytes: &[u8]) -> Result<Vec<String>, String> {
    let doc = pdf_extract::Document::load_mem(bytes).map_err(|e| format!("pdf_extract: {e}"))?;
    let page_count = doc.get_pages().len() as u32;
    Ok(salvage_pages(page_count, |page_num| {
        let mut text = String::new();
        let mut output = pdf_extract::PlainTextOutput::new(&mut text);
        pdf_extract::output_doc_page(&doc, &mut output, page_num).map_err(|e| e.to_string())?;
        Ok(text)
    }))
}

/// Run `extract_page` for each 1-indexed page, isolating per-page panics and
/// errors so survivors are still returned. The default panic hook is silenced
/// for the duration so per-page glyph panics don't spam the app's panic logger.
fn salvage_pages<F>(page_count: u32, extract_page: F) -> Vec<String>
where
    F: Fn(u32) -> Result<String, String>,
{
    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    let pages = (1..=page_count)
        .filter_map(|page_num| {
            match catch_unwind(AssertUnwindSafe(|| extract_page(page_num))) {
                Ok(Ok(text)) => Some(text),
                Ok(Err(e)) => {
                    log::warn!("PDF page {page_num} extraction error, skipping: {e}");
                    None
                }
                Err(_) => {
                    log::warn!("PDF page {page_num} extraction panicked, skipping");
                    None
                }
            }
        })
        .collect();
    std::panic::set_hook(previous_hook);
    pages
}

fn decode_text_body(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    let encoding = detector.guess(None, true);
    let (decoded, _, _) = encoding.decode(bytes);
    truncate_body(decoded.into_owned())
}

fn truncate_body(text: String) -> String {
    if text.len() <= MAX_INDEXABLE_BYTES {
        text
    } else {
        let mut end = MAX_INDEXABLE_BYTES;
        while end > 0 && !text.is_char_boundary(end) {
            end -= 1;
        }
        text[..end].to_string()
    }
}

pub fn resolve_snippet_page(snippet: &str, body: &str, page_offsets: &[usize]) -> Option<u32> {
    if page_offsets.is_empty() {
        return None;
    }
    let clean: String = snippet
        .replace("<b>", "")
        .replace("</b>", "")
        .replace("...", "");
    let fragment = clean
        .split_whitespace()
        .take(5)
        .collect::<Vec<_>>()
        .join(" ");
    if fragment.is_empty() {
        return None;
    }
    let pos = body.find(&fragment)?;
    let page_idx = page_offsets
        .partition_point(|&o| o <= pos)
        .saturating_sub(1);
    Some(page_idx as u32 + 1) // 1-indexed
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn classify_markdown() {
        assert_eq!(
            classify_file(&PathBuf::from("notes/hello.md")).as_str(),
            "markdown"
        );
    }

    #[test]
    fn classify_pdf() {
        assert_eq!(
            classify_file(&PathBuf::from("docs/paper.pdf")).as_str(),
            "pdf"
        );
    }

    #[test]
    fn classify_code_extensions() {
        for ext in &["py", "rs", "ts", "js", "go", "java", "svelte"] {
            let p = PathBuf::from(format!("src/file.{ext}"));
            assert_eq!(classify_file(&p), FileCategory::Code, "failed for .{ext}");
        }
    }

    #[test]
    fn classify_html_extensions() {
        for ext in &["html", "htm"] {
            let p = PathBuf::from(format!("artifacts/page.{ext}"));
            assert_eq!(classify_file(&p), FileCategory::Html, "failed for .{ext}");
        }
        assert_eq!(
            classify_file(&PathBuf::from("artifacts/page.html")).as_str(),
            "html"
        );
    }

    #[test]
    fn classify_epub() {
        assert_eq!(classify_file(&PathBuf::from("book.epub")).as_str(), "epub");
    }

    #[test]
    fn classify_text_extensions() {
        for ext in &["txt", "log", "csv", "ini"] {
            let p = PathBuf::from(format!("data/file.{ext}"));
            assert_eq!(classify_file(&p), FileCategory::Text, "failed for .{ext}");
        }
    }

    #[test]
    fn classify_binary_unknown() {
        assert_eq!(
            classify_file(&PathBuf::from("image.png")),
            FileCategory::Binary
        );
    }

    #[test]
    fn classify_dockerfile() {
        assert_eq!(
            classify_file(&PathBuf::from("Dockerfile")),
            FileCategory::Text
        );
    }

    #[test]
    fn decode_text_utf8() {
        let body = decode_text_body(b"hello world");
        assert_eq!(body, "hello world");
    }

    #[test]
    fn decode_text_empty() {
        assert_eq!(decode_text_body(b""), "");
    }

    #[test]
    fn truncate_large_body() {
        let big = "a".repeat(MAX_INDEXABLE_BYTES + 1000);
        let result = truncate_body(big);
        assert!(result.len() <= MAX_INDEXABLE_BYTES);
    }

    #[test]
    fn extract_content_code_file() {
        let bytes = b"fn main() { println!(\"hello\"); }";
        let result = extract_content(&PathBuf::from("main.rs"), bytes);
        assert_eq!(result.category, FileCategory::Code);
        assert!(result.body.contains("fn main"));
    }

    #[test]
    fn extract_content_binary_skipped() {
        let result = extract_content(&PathBuf::from("photo.png"), &[0xFF, 0xD8, 0xFF]);
        assert_eq!(result.category, FileCategory::Binary);
        assert!(result.body.is_empty());
    }

    #[test]
    fn resolve_snippet_page_finds_correct_page() {
        let body = "Page one content\nPage two content\nPage three content\n";
        let offsets = vec![0, 17, 34];
        assert_eq!(resolve_snippet_page("Page one", body, &offsets), Some(1));
        assert_eq!(
            resolve_snippet_page("<b>Page</b> two", body, &offsets),
            Some(2)
        );
        assert_eq!(
            resolve_snippet_page("...Page three...", body, &offsets),
            Some(3)
        );
    }

    #[test]
    fn resolve_snippet_page_empty_offsets() {
        assert_eq!(resolve_snippet_page("text", "text", &[]), None);
    }

    #[test]
    fn resolve_snippet_page_no_match() {
        assert_eq!(resolve_snippet_page("nonexistent", "some body", &[0]), None);
    }

    #[test]
    fn extract_content_code_has_no_page_offsets() {
        let result = extract_content(&PathBuf::from("main.rs"), b"fn main() {}");
        assert!(result.page_offsets.is_empty());
    }

    #[test]
    fn extract_content_bad_pdf_yields_empty_body_without_panic() {
        // Garbage bytes that are not a valid PDF. extract_pdf_text should Err,
        // the surrounding extract_content should swallow the error, log a warn
        // with path + cause, and return an empty body so the indexer doesn't
        // abort the rest of the batch.
        let path = PathBuf::from("broken.pdf");
        let bytes = b"not actually a pdf, just garbage bytes";
        let result = extract_content(&path, bytes);
        assert_eq!(result.category, FileCategory::Pdf);
        assert!(result.body.is_empty());
        assert!(result.page_offsets.is_empty());
    }

    #[test]
    fn extract_pdf_text_errors_on_garbage_bytes() {
        let err = extract_pdf_text(b"not a pdf").expect_err("garbage bytes must fail");
        assert!(!err.is_empty(), "error message must be non-empty for log");
    }

    #[test]
    fn salvage_pages_keeps_survivors_when_one_page_panics() {
        let survivors = salvage_pages(3, |page_num| {
            if page_num == 2 {
                panic!("unmappable glyph on page {page_num}");
            }
            Ok(format!("page {page_num} text"))
        });
        assert_eq!(survivors, vec!["page 1 text", "page 3 text"]);
    }

    #[test]
    fn salvage_pages_drops_erroring_pages_but_returns_rest() {
        let survivors = salvage_pages(3, |page_num| {
            if page_num == 1 {
                Err("decode failure".to_string())
            } else {
                Ok(format!("page {page_num} text"))
            }
        });
        assert_eq!(survivors, vec!["page 2 text", "page 3 text"]);
    }

    #[test]
    fn salvage_pages_returns_all_when_no_failures() {
        let survivors = salvage_pages(2, |page_num| Ok(format!("p{page_num}")));
        assert_eq!(survivors, vec!["p1", "p2"]);
    }

    #[test]
    fn salvage_pages_zero_pages_yields_empty() {
        let survivors = salvage_pages(0, |_| -> Result<String, String> {
            panic!("must not be called")
        });
        assert!(survivors.is_empty());
    }

    #[test]
    fn salvage_pages_restores_default_panic_hook() {
        let _ = salvage_pages(1, |_| -> Result<String, String> { panic!("boom") });
        // After salvage, a normal catch_unwind should still capture payloads —
        // i.e. the hook was restored rather than left as the silent no-op.
        let caught = catch_unwind(AssertUnwindSafe(|| panic!("post-salvage")));
        assert!(caught.is_err());
    }
}
