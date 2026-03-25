use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq)]
pub enum FileCategory {
    Markdown,
    Canvas,
    Pdf,
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
            Self::Code => "code",
            Self::Text => "text",
            Self::Binary => "binary",
        }
    }
}

pub struct ExtractedContent {
    pub category: FileCategory,
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
        "py" | "r" | "rs" | "ts" | "js" | "jsx" | "tsx" | "json" | "yaml" | "yml" | "toml"
        | "sh" | "bash" | "css" | "scss" | "html" | "xml" | "sql" | "go" | "java" | "kt"
        | "c" | "cpp" | "h" | "hpp" | "cs" | "rb" | "lua" | "zig" | "swift" | "dart"
        | "ex" | "exs" | "erl" | "hs" | "ml" | "clj" | "scala" | "php" | "pl" | "vim"
        | "el" | "nix" | "dhall" | "tf" | "hcl" | "graphql" | "proto" | "svelte" | "vue"
        | "astro" => FileCategory::Code,
        "txt" | "log" | "ini" | "cfg" | "conf" | "env" | "csv" | "tsv" | "rst"
        | "adoc" | "org" | "diff" | "patch" | "properties" | "dockerfile" | "makefile"
        | "cmake" | "gitignore" | "gitattributes" | "editorconfig" => FileCategory::Text,
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

const MAX_INDEXABLE_BYTES: usize = 512 * 1024; // 512 KB body cap for FTS

pub fn extract_content(path: &Path, bytes: &[u8]) -> ExtractedContent {
    let category = classify_file(path);
    match category {
        FileCategory::Markdown | FileCategory::Canvas => ExtractedContent {
            category,
            body: String::new(), // handled by existing pipelines
            page_offsets: vec![],
        },
        FileCategory::Pdf => {
            let (body, page_offsets) = extract_pdf_text(bytes).unwrap_or_default();
            ExtractedContent {
                category: FileCategory::Pdf,
                body,
                page_offsets,
            }
        }
        FileCategory::Code | FileCategory::Text => {
            let body = decode_text_body(bytes);
            ExtractedContent {
                category,
                body,
                page_offsets: vec![],
            }
        }
        FileCategory::Binary => ExtractedContent {
            category: FileCategory::Binary,
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
        let result = pdf_extract::extract_text_from_mem_by_pages(&owned)
            .map_err(|e| format!("PDF extraction: {e}"));
        let _ = tx.send(result);
    });

    let pages = rx
        .recv_timeout(PDF_EXTRACT_TIMEOUT)
        .map_err(|_| "PDF extraction timed out".to_string())??;

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
    let fragment = clean.split_whitespace().take(5).collect::<Vec<_>>().join(" ");
    if fragment.is_empty() {
        return None;
    }
    let pos = body.find(&fragment)?;
    let page_idx = page_offsets.partition_point(|&o| o <= pos).saturating_sub(1);
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
        assert_eq!(
            resolve_snippet_page("Page one", body, &offsets),
            Some(1)
        );
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
        assert_eq!(
            resolve_snippet_page("nonexistent", "some body", &[0]),
            None
        );
    }

    #[test]
    fn extract_content_code_has_no_page_offsets() {
        let result = extract_content(&PathBuf::from("main.rs"), b"fn main() {}");
        assert!(result.page_offsets.is_empty());
    }
}
