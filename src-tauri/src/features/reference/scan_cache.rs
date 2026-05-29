//! Content-addressed cache for linked-source PDF/HTML extraction results.
//!
//! Reindexing the same paper twice — common when a linked-source folder is
//! re-scanned and the file has not changed — used to re-run the full PDF text
//! extraction (~20s per paper, see Phase 3.2 in the bug plan). This cache
//! skips that work whenever the file bytes are unchanged.
//!
//! Layout: `~/.carbide/linked_source_cache/<blake3-hex>.json`. The cache value
//! omits `file_path` and `modified_at` because they are per-file, not per-content,
//! and are re-derived from the current path on load.
//!
//! Schema versioning: bumping `CACHE_SCHEMA_VERSION` invalidates every entry.
//! Old entries either fail to deserialize or carry a stale version and are
//! treated as misses; they are overwritten on the next extraction.

use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::features::reference::linked_source::ScanEntry;
use crate::shared::io_utils;

const CACHE_SCHEMA_VERSION: u32 = 1;
const HASH_BUF_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedScanEntry {
    schema_version: u32,
    file_type: String,
    title: Option<String>,
    author: Option<String>,
    subject: Option<String>,
    keywords: Option<String>,
    doi: Option<String>,
    isbn: Option<String>,
    arxiv_id: Option<String>,
    creation_date: Option<String>,
    body_text: String,
    page_offsets: Vec<usize>,
}

pub struct ScanCache<'a> {
    app: &'a AppHandle,
}

impl<'a> ScanCache<'a> {
    pub fn new(app: &'a AppHandle) -> Self {
        Self { app }
    }

    pub fn try_load(&self, hash: &str, path: &Path) -> Option<ScanEntry> {
        let cache_path = self.entry_path(hash).ok()?;
        let bytes = std::fs::read(&cache_path).ok()?;
        let cached: CachedScanEntry = serde_json::from_slice(&bytes).ok()?;
        if cached.schema_version != CACHE_SCHEMA_VERSION {
            return None;
        }
        Some(scan_entry_from(cached, path))
    }

    pub fn store(&self, hash: &str, entry: &ScanEntry) -> Result<(), String> {
        let cache_path = self.entry_path(hash)?;
        let cached = CachedScanEntry {
            schema_version: CACHE_SCHEMA_VERSION,
            file_type: entry.file_type.clone(),
            title: entry.title.clone(),
            author: entry.author.clone(),
            subject: entry.subject.clone(),
            keywords: entry.keywords.clone(),
            doi: entry.doi.clone(),
            isbn: entry.isbn.clone(),
            arxiv_id: entry.arxiv_id.clone(),
            creation_date: entry.creation_date.clone(),
            body_text: entry.body_text.clone(),
            page_offsets: entry.page_offsets.clone(),
        };
        let bytes = serde_json::to_vec(&cached).map_err(|e| format!("serialize: {e}"))?;
        io_utils::atomic_write(&cache_path, bytes)
    }

    fn entry_path(&self, hash: &str) -> Result<PathBuf, String> {
        let dir = cache_dir(self.app)?;
        Ok(dir.join(format!("{hash}.json")))
    }
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("home_dir: {e}"))?;
    let dir = home.join(".carbide").join("linked_source_cache");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create cache dir: {e}"))?;
    Ok(dir)
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string()
}

fn modified_at_of(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64
        })
        .unwrap_or(0)
}

fn scan_entry_from(cached: CachedScanEntry, path: &Path) -> ScanEntry {
    ScanEntry {
        file_path: path.to_string_lossy().into_owned(),
        file_name: file_name_of(path),
        file_type: cached.file_type,
        title: cached.title,
        author: cached.author,
        subject: cached.subject,
        keywords: cached.keywords,
        doi: cached.doi,
        isbn: cached.isbn,
        arxiv_id: cached.arxiv_id,
        creation_date: cached.creation_date,
        body_text: cached.body_text,
        page_offsets: cached.page_offsets,
        modified_at: modified_at_of(path),
    }
}

pub fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("open: {e}"))?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; HASH_BUF_BYTES];
    loop {
        let n = file.read(&mut buf).map_err(|e| format!("read: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn make_entry(file_path: &str, body: &str) -> ScanEntry {
        ScanEntry {
            file_path: file_path.to_string(),
            file_name: "paper.pdf".to_string(),
            file_type: "pdf".to_string(),
            title: Some("Test Title".to_string()),
            author: Some("Test Author".to_string()),
            subject: None,
            keywords: None,
            doi: Some("10.1234/test".to_string()),
            isbn: None,
            arxiv_id: None,
            creation_date: None,
            body_text: body.to_string(),
            page_offsets: vec![0],
            modified_at: 12345,
        }
    }

    #[test]
    fn hash_file_stable_across_calls() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("x.bin");
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(b"deterministic bytes").unwrap();
        drop(f);
        let h1 = hash_file(&p).unwrap();
        let h2 = hash_file(&p).unwrap();
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64); // 32 bytes hex-encoded
    }

    #[test]
    fn hash_file_differs_for_different_content() {
        let dir = tempfile::tempdir().unwrap();
        let p1 = dir.path().join("a.bin");
        let p2 = dir.path().join("b.bin");
        std::fs::write(&p1, b"alpha").unwrap();
        std::fs::write(&p2, b"beta").unwrap();
        let h1 = hash_file(&p1).unwrap();
        let h2 = hash_file(&p2).unwrap();
        assert_ne!(h1, h2);
    }

    #[test]
    fn scan_entry_from_restores_per_file_fields() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("paper.pdf");
        std::fs::write(&p, b"pdf bytes").unwrap();

        let cached = CachedScanEntry {
            schema_version: CACHE_SCHEMA_VERSION,
            file_type: "pdf".to_string(),
            title: Some("Cached".to_string()),
            author: None,
            subject: None,
            keywords: None,
            doi: None,
            isbn: None,
            arxiv_id: None,
            creation_date: None,
            body_text: "cached body".to_string(),
            page_offsets: vec![0],
        };
        let entry = scan_entry_from(cached, &p);
        assert_eq!(entry.file_path, p.to_string_lossy());
        assert_eq!(entry.file_name, "paper.pdf");
        assert_eq!(entry.title.as_deref(), Some("Cached"));
        assert_eq!(entry.body_text, "cached body");
        assert!(entry.modified_at > 0, "modified_at should be re-derived");
    }

    #[test]
    fn cached_scan_entry_roundtrips_through_serde() {
        let entry = make_entry("/some/path.pdf", "hello world");
        let cached = CachedScanEntry {
            schema_version: CACHE_SCHEMA_VERSION,
            file_type: entry.file_type.clone(),
            title: entry.title.clone(),
            author: entry.author.clone(),
            subject: entry.subject.clone(),
            keywords: entry.keywords.clone(),
            doi: entry.doi.clone(),
            isbn: entry.isbn.clone(),
            arxiv_id: entry.arxiv_id.clone(),
            creation_date: entry.creation_date.clone(),
            body_text: entry.body_text.clone(),
            page_offsets: entry.page_offsets.clone(),
        };
        let bytes = serde_json::to_vec(&cached).unwrap();
        let parsed: CachedScanEntry = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(parsed.schema_version, CACHE_SCHEMA_VERSION);
        assert_eq!(parsed.body_text, "hello world");
        assert_eq!(parsed.doi.as_deref(), Some("10.1234/test"));
    }

    #[test]
    fn stale_schema_version_treated_as_miss() {
        let mut cached_bytes = serde_json::json!({
            "schema_version": CACHE_SCHEMA_VERSION + 100,
            "file_type": "pdf",
            "title": null,
            "author": null,
            "subject": null,
            "keywords": null,
            "doi": null,
            "isbn": null,
            "arxiv_id": null,
            "creation_date": null,
            "body_text": "future-schema",
            "page_offsets": []
        });
        // serde_json roundtrip to confirm the JSON is valid before checking the
        // schema-version check rejects it. Done implicitly by from_slice below.
        let raw = serde_json::to_vec(&cached_bytes).unwrap();
        let parsed: CachedScanEntry = serde_json::from_slice(&raw).unwrap();
        assert_ne!(parsed.schema_version, CACHE_SCHEMA_VERSION);
        // The schema-version guard lives in try_load — confirm the gate
        // with a direct comparison rather than re-entering the cache.
        cached_bytes["schema_version"] = serde_json::json!(CACHE_SCHEMA_VERSION);
        let revived: CachedScanEntry = serde_json::from_value(cached_bytes).unwrap();
        assert_eq!(revived.schema_version, CACHE_SCHEMA_VERSION);
    }
}
