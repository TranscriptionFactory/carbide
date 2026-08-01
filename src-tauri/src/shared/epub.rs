use serde::{Deserialize, Serialize};
use specta::Type;
use std::io::Write;
use std::path::Path;

use crate::features::notes::service::safe_vault_abs;

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct EpubImage {
    pub href: String,
    pub asset_path: String,
    pub media_type: String,
}

#[derive(Debug, Serialize, Deserialize, Type)]
pub struct EpubInput {
    pub title: String,
    pub source_url: Option<String>,
    pub created_at: String,
    pub xhtml: String,
    pub css: Option<String>,
    pub images: Vec<EpubImage>,
}

const CSS_HREF: &str = "style.css";

const CONTAINER_XML: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"#;

pub fn read_epub_images<'a>(
    vault_root: &Path,
    images: &'a [EpubImage],
) -> Result<Vec<(&'a EpubImage, Vec<u8>)>, String> {
    images
        .iter()
        .map(|image| {
            let abs = safe_vault_abs(vault_root, &image.asset_path)?;
            let bytes = std::fs::read(&abs)
                .map_err(|e| format!("Failed to read asset {}: {e}", image.asset_path))?;
            Ok((image, bytes))
        })
        .collect()
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn epub_timestamp(created_at: &str) -> String {
    match created_at.split_once('.') {
        Some((prefix, _)) => format!("{prefix}Z"),
        None => created_at.to_string(),
    }
}

// EPUB 3 requires a globally unique dc:identifier. A URL is not always
// available (notes have no source), so the id is a UUIDv5-shaped digest of the
// publication content: unique per book, stable across re-exports of the same
// content, and no RNG dependency.
fn publication_id(input: &EpubInput) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(input.title.as_bytes());
    hasher.update(input.created_at.as_bytes());
    hasher.update(input.xhtml.as_bytes());
    hasher.update(input.source_url.as_deref().unwrap_or("").as_bytes());

    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&hasher.finalize().as_bytes()[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    format!(
        "urn:uuid:{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

fn build_opf(input: &EpubInput, images: &[(&EpubImage, Vec<u8>)]) -> String {
    let title = xml_escape(&input.title);
    let identifier = publication_id(input);
    let modified = epub_timestamp(&input.created_at);
    let source_element = match &input.source_url {
        Some(url) => format!("    <dc:source>{}</dc:source>\n", xml_escape(url)),
        None => String::new(),
    };
    let css_item = match input.css {
        Some(_) => format!("    <item id=\"css\" href=\"{CSS_HREF}\" media-type=\"text/css\"/>\n"),
        None => String::new(),
    };
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
    <dc:identifier id="pub-id">{identifier}</dc:identifier>
    <dc:title>{title}</dc:title>
    <dc:language>en</dc:language>
{source_element}    <dc:date>{modified}</dc:date>
    <meta property="dcterms:modified">{modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
{css_item}{manifest_images}  </manifest>
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

pub fn build_epub(input: &EpubInput, images: &[(&EpubImage, Vec<u8>)]) -> Result<Vec<u8>, String> {
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

    if let Some(css) = &input.css {
        zip.start_file(format!("OEBPS/{CSS_HREF}"), deflated)
            .map_err(err)?;
        zip.write_all(css.as_bytes()).map_err(io_err)?;
    }

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

    fn sample_input() -> EpubInput {
        EpubInput {
            title: "Clipped Article".to_string(),
            source_url: Some("https://example.com/post?a=1&b=2".to_string()),
            created_at: "2026-07-20T12:34:56.789Z".to_string(),
            xhtml: r#"<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Clipped Article</title></head>
<body><h1>Clipped Article</h1><p>Readable body text survives the roundtrip.</p>
<img src="images/img-0.png" alt=""/></body>
</html>
"#
            .to_string(),
            css: None,
            images: vec![],
        }
    }

    fn entry_names(epub: &[u8]) -> Vec<String> {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(epub.to_vec())).unwrap();
        (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect()
    }

    fn entry_text(epub: &[u8], name: &str) -> String {
        use std::io::Read;
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(epub.to_vec())).unwrap();
        let mut file = archive.by_name(name).unwrap();
        let mut out = String::new();
        file.read_to_string(&mut out).unwrap();
        out
    }

    #[test]
    fn epub_roundtrips_through_extractor() {
        let input = sample_input();
        let png = b"\x89PNG\r\n\x1a\nfakebytes".to_vec();
        let image = EpubImage {
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
    fn identifier_is_a_uuid_urn_independent_of_source_url() {
        let opf = build_opf(&sample_input(), &[]);
        let start = opf.find("<dc:identifier id=\"pub-id\">").unwrap()
            + "<dc:identifier id=\"pub-id\">".len();
        let end = opf[start..].find('<').unwrap() + start;
        let id = &opf[start..end];

        assert!(id.starts_with("urn:uuid:"), "identifier was {id}");
        let uuid = &id["urn:uuid:".len()..];
        let groups: Vec<&str> = uuid.split('-').collect();
        assert_eq!(
            groups.iter().map(|g| g.len()).collect::<Vec<_>>(),
            vec![8, 4, 4, 4, 12]
        );
        assert!(uuid.chars().all(|c| c.is_ascii_hexdigit() || c == '-'));
        assert!(groups[2].starts_with('4'), "version nibble missing in {id}");
        assert!(matches!(
            groups[3].chars().next(),
            Some('8') | Some('9') | Some('a') | Some('b')
        ));
    }

    #[test]
    fn identifier_is_stable_for_identical_content() {
        assert_eq!(
            build_opf(&sample_input(), &[]),
            build_opf(&sample_input(), &[])
        );
        let mut other = sample_input();
        other.title = "Another Title".to_string();
        assert_ne!(build_opf(&sample_input(), &[]), build_opf(&other, &[]));
    }

    #[test]
    fn source_element_is_omitted_without_a_source_url() {
        let mut input = sample_input();
        input.source_url = None;
        let opf = build_opf(&input, &[]);
        assert!(!opf.contains("<dc:source>"));
        assert!(opf.contains("<dc:identifier id=\"pub-id\">urn:uuid:"));
    }

    // A reader resolves container.xml -> OPF -> spine -> content.xhtml; the
    // extractor walks the same chain, so this is the closest automated stand-in
    // for "opens in a reader" for a note-shaped (no source URL, styled) book.
    #[test]
    fn note_shaped_epub_resolves_through_the_full_reader_chain() {
        let input = EpubInput {
            title: "Field Notes".to_string(),
            source_url: None,
            created_at: "2026-07-31T00:00:00.000Z".to_string(),
            xhtml: r#"<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Field Notes</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><h1>Field Notes</h1><p>Chapter text.</p><img src="images/img-0.png" alt="fig"/></body>
</html>
"#
            .to_string(),
            css: Some("body { font-family: serif; }".to_string()),
            images: vec![],
        };
        let image = EpubImage {
            href: "images/img-0.png".to_string(),
            asset_path: ".assets/fig.png".to_string(),
            media_type: "image/png".to_string(),
        };
        let epub = build_epub(&input, &[(&image, b"\x89PNG\r\n\x1a\nbytes".to_vec())]).unwrap();

        let names = entry_names(&epub);
        for required in [
            "mimetype",
            "META-INF/container.xml",
            "OEBPS/content.opf",
            "OEBPS/nav.xhtml",
            "OEBPS/content.xhtml",
            "OEBPS/style.css",
            "OEBPS/images/img-0.png",
        ] {
            assert!(names.contains(&required.to_string()), "missing {required}");
        }

        let extraction = extract_epub_text(&epub);
        assert_eq!(extraction.title.as_deref(), Some("Field Notes"));
        assert!(extraction.body.contains("Chapter text."));

        let opf = entry_text(&epub, "OEBPS/content.opf");
        assert!(opf.contains("<itemref idref=\"content\"/>"));
        assert!(opf.contains("properties=\"nav\""));
        assert!(opf.contains(
            "<item id=\"img-0\" href=\"images/img-0.png\" media-type=\"image/png\"/>"
        ));
    }

    #[test]
    fn css_is_written_and_manifested_only_when_present() {
        let without = build_epub(&sample_input(), &[]).unwrap();
        assert!(!entry_names(&without).contains(&"OEBPS/style.css".to_string()));
        assert!(!entry_text(&without, "OEBPS/content.opf").contains("style.css"));

        let mut input = sample_input();
        input.css = Some("body { color: #123456; }".to_string());
        let with = build_epub(&input, &[]).unwrap();
        assert!(entry_names(&with).contains(&"OEBPS/style.css".to_string()));
        assert_eq!(
            entry_text(&with, "OEBPS/style.css"),
            "body { color: #123456; }"
        );
        assert!(entry_text(&with, "OEBPS/content.opf")
            .contains("<item id=\"css\" href=\"style.css\" media-type=\"text/css\"/>"));
    }
}
