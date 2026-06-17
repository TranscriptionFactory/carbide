use quick_xml::events::Event;
use quick_xml::reader::Reader;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use zip::ZipArchive;

pub struct EpubExtraction {
    pub title: Option<String>,
    pub body: String,
}

const MAX_ENTRY_BYTES: u64 = 10 * 1024 * 1024;

const CONTAINER_PATH: &str = "META-INF/container.xml";

pub fn extract_epub_text(bytes: &[u8]) -> EpubExtraction {
    extract(bytes).unwrap_or(EpubExtraction {
        title: None,
        body: String::new(),
    })
}

fn extract(bytes: &[u8]) -> Option<EpubExtraction> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).ok()?;

    let container = read_entry(&mut archive, CONTAINER_PATH)?;
    let opf_path = find_opf_path(&container)?;

    let opf = read_entry(&mut archive, &opf_path)?;
    let opf_dir = parent_dir(&opf_path);
    let parsed = parse_opf(&opf);

    let mut body = String::new();
    let cap = crate::features::search::text_extractor::MAX_INDEXABLE_BYTES;
    for idref in &parsed.spine {
        let Some((href, media_type)) = parsed.manifest.get(idref) else {
            continue;
        };
        if !is_xhtml(media_type) {
            continue;
        }
        let entry_path = resolve_href(&opf_dir, href);
        let Some(entry_bytes) = read_entry(&mut archive, &entry_path) else {
            continue;
        };
        let extraction = crate::features::search::html_extractor::extract_html_text(&entry_bytes);
        if !body.is_empty() {
            body.push('\n');
        }
        body.push_str(&extraction.body);
        if body.len() >= cap {
            break;
        }
    }

    Some(EpubExtraction {
        title: parsed.title,
        body,
    })
}

fn read_entry<R: Read + std::io::Seek>(archive: &mut ZipArchive<R>, name: &str) -> Option<Vec<u8>> {
    let mut file = archive.by_name(name).ok()?;
    if file.size() > MAX_ENTRY_BYTES {
        return None;
    }
    let mut buf = Vec::with_capacity(file.size() as usize);
    file.read_to_end(&mut buf).ok()?;
    Some(buf)
}

fn find_opf_path(container_xml: &[u8]) -> Option<String> {
    let mut reader = Reader::from_reader(container_xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(e)) | Ok(Event::Start(e)) => {
                if local_name(e.name().as_ref()) == b"rootfile" {
                    if let Some(path) = attr_value(&e, b"full-path") {
                        if !path.is_empty() {
                            return Some(path);
                        }
                    }
                }
            }
            Ok(Event::Eof) | Err(_) => return None,
            _ => {}
        }
        buf.clear();
    }
}

struct ParsedOpf {
    title: Option<String>,
    manifest: HashMap<String, (String, String)>,
    spine: Vec<String>,
}

fn parse_opf(opf_xml: &[u8]) -> ParsedOpf {
    let mut reader = Reader::from_reader(opf_xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();

    let mut title: Option<String> = None;
    let mut manifest: HashMap<String, (String, String)> = HashMap::new();
    let mut spine: Vec<String> = Vec::new();
    let mut in_title = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = local_name(e.name().as_ref()).to_vec();
                if name == b"title" {
                    in_title = true;
                } else if name == b"item" {
                    record_manifest_item(&e, &mut manifest);
                } else if name == b"itemref" {
                    if let Some(idref) = attr_value(&e, b"idref") {
                        spine.push(idref);
                    }
                }
            }
            Ok(Event::Empty(e)) => {
                let name = local_name(e.name().as_ref()).to_vec();
                if name == b"item" {
                    record_manifest_item(&e, &mut manifest);
                } else if name == b"itemref" {
                    if let Some(idref) = attr_value(&e, b"idref") {
                        spine.push(idref);
                    }
                }
            }
            Ok(Event::Text(t)) => {
                if in_title && title.is_none() {
                    if let Ok(text) = t.xml_content() {
                        let trimmed = text.trim();
                        if !trimmed.is_empty() {
                            title = Some(trimmed.to_string());
                        }
                    }
                }
            }
            Ok(Event::End(e)) => {
                if local_name(e.name().as_ref()) == b"title" {
                    in_title = false;
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    ParsedOpf {
        title,
        manifest,
        spine,
    }
}

fn record_manifest_item(
    e: &quick_xml::events::BytesStart,
    manifest: &mut HashMap<String, (String, String)>,
) {
    let id = attr_value(e, b"id");
    let href = attr_value(e, b"href");
    let media_type = attr_value(e, b"media-type").unwrap_or_default();
    if let (Some(id), Some(href)) = (id, href) {
        manifest.insert(id, (href, media_type));
    }
}

fn is_xhtml(media_type: &str) -> bool {
    matches!(media_type, "application/xhtml+xml" | "text/html")
}

fn local_name(qualified: &[u8]) -> &[u8] {
    match qualified.iter().rposition(|&b| b == b':') {
        Some(idx) => &qualified[idx + 1..],
        None => qualified,
    }
}

fn attr_value(e: &quick_xml::events::BytesStart, key: &[u8]) -> Option<String> {
    for attr in e.attributes().flatten() {
        if local_name(attr.key.as_ref()) == key {
            return attr.unescape_value().ok().map(|v| v.into_owned());
        }
    }
    None
}

fn parent_dir(path: &str) -> String {
    match path.rfind('/') {
        Some(idx) => path[..idx].to_string(),
        None => String::new(),
    }
}

fn resolve_href(base_dir: &str, href: &str) -> String {
    let joined = if base_dir.is_empty() {
        href.to_string()
    } else {
        format!("{base_dir}/{href}")
    };
    collapse_path(&joined)
}

fn collapse_path(path: &str) -> String {
    let mut segments: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            other => segments.push(other),
        }
    }
    segments.join("/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn build_sample_epub() -> Vec<u8> {
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut zip = ZipWriter::new(&mut cursor);
            let stored =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            let deflated =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

            zip.start_file("mimetype", stored).unwrap();
            zip.write_all(b"application/epub+zip").unwrap();

            zip.start_file("META-INF/container.xml", deflated).unwrap();
            zip.write_all(
                br#"<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#,
            )
            .unwrap();

            zip.start_file("OEBPS/content.opf", deflated).unwrap();
            zip.write_all(
                br#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>The Time Machine</dc:title>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>"#,
            )
            .unwrap();

            zip.start_file("OEBPS/ch1.xhtml", deflated).unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Ch1</title></head>
<body><p>An instantaneous cube cannot exist.</p></body></html>"#,
            )
            .unwrap();

            zip.start_file("OEBPS/ch2.xhtml", deflated).unwrap();
            zip.write_all(
                br#"<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Ch2</title></head>
<body><p>Time is really the fourth dimension.</p></body></html>"#,
            )
            .unwrap();

            zip.finish().unwrap();
        }
        cursor.into_inner()
    }

    #[test]
    fn extracts_title_and_body() {
        let epub = build_sample_epub();
        let res = extract_epub_text(&epub);
        assert_eq!(res.title.as_deref(), Some("The Time Machine"));
        assert!(res.body.contains("instantaneous cube"));
        assert!(res.body.contains("fourth dimension"));
    }

    #[test]
    fn spine_order_preserved() {
        let epub = build_sample_epub();
        let res = extract_epub_text(&epub);
        let cube = res.body.find("instantaneous cube").unwrap();
        let dimension = res.body.find("fourth dimension").unwrap();
        assert!(cube < dimension);
    }

    #[test]
    fn garbage_bytes_yield_empty_without_panic() {
        let res = extract_epub_text(b"not a zip");
        assert!(res.title.is_none());
        assert!(res.body.is_empty());
    }

    #[test]
    fn empty_bytes_yield_empty() {
        let res = extract_epub_text(b"");
        assert!(res.title.is_none());
        assert!(res.body.is_empty());
    }

    #[test]
    fn resolve_href_collapses_relative_segments() {
        assert_eq!(resolve_href("OEBPS", "ch1.xhtml"), "OEBPS/ch1.xhtml");
        assert_eq!(
            resolve_href("OEBPS/text", "../ch1.xhtml"),
            "OEBPS/ch1.xhtml"
        );
        assert_eq!(resolve_href("", "ch1.xhtml"), "ch1.xhtml");
    }
}
