use scraper::{Html, Selector};
use std::sync::LazyLock;

// Constant selectors compiled once; reparsing them per HTML file was pure
// repeated work in the full-index hot loop. The literals cannot fail to parse.
static TITLE_SEL: LazyLock<Selector> = LazyLock::new(|| Selector::parse("title").unwrap());
static H1_SEL: LazyLock<Selector> = LazyLock::new(|| Selector::parse("h1").unwrap());
static BODY_SEL: LazyLock<Selector> = LazyLock::new(|| Selector::parse("body").unwrap());

pub struct HtmlExtraction {
    pub title: Option<String>,
    pub body: String,
}

pub(crate) fn sniff_decode(bytes: &[u8]) -> String {
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    let encoding = detector.guess(None, true);
    let (decoded, _, _) = encoding.decode(bytes);
    decoded.into_owned()
}

pub fn extract_html_text(bytes: &[u8]) -> HtmlExtraction {
    if bytes.is_empty() {
        return HtmlExtraction {
            title: None,
            body: String::new(),
        };
    }

    let decoded = sniff_decode(bytes);

    let doc = Html::parse_document(&decoded);
    let title = extract_title(&doc);
    let body = extract_visible_text(&doc);
    HtmlExtraction { title, body }
}

fn extract_title(doc: &Html) -> Option<String> {
    if let Some(node) = doc.select(&TITLE_SEL).next() {
        let text = collect_text(&node).trim().to_string();
        if !text.is_empty() {
            return Some(text);
        }
    }
    doc.select(&H1_SEL)
        .next()
        .map(|n| collect_text(&n).trim().to_string())
        .filter(|s| !s.is_empty())
}

fn extract_visible_text(doc: &Html) -> String {
    let root = doc.select(&BODY_SEL).next();
    let mut out = String::new();
    match root {
        Some(node) => append_text(&node, &mut out),
        None => {
            // No <body> — walk the whole document root.
            for child in doc.root_element().children() {
                if let Some(el) = scraper::ElementRef::wrap(child) {
                    append_text(&el, &mut out);
                }
            }
        }
    }
    normalize_whitespace(&out)
}

fn collect_text(el: &scraper::ElementRef) -> String {
    let mut s = String::new();
    for t in el.text() {
        s.push_str(t);
    }
    s
}

const SKIP_TAGS: &[&str] = &["script", "style", "noscript", "template"];

fn append_text(el: &scraper::ElementRef, out: &mut String) {
    let tag = el.value().name();
    if SKIP_TAGS.contains(&tag) {
        return;
    }
    for child in el.children() {
        if let Some(text) = child.value().as_text() {
            out.push_str(text);
        } else if let Some(child_el) = scraper::ElementRef::wrap(child) {
            append_text(&child_el, out);
            // Block-ish tags add a separator so words don't run together.
            if is_block_tag(child_el.value().name()) {
                out.push('\n');
            }
        }
    }
}

fn is_block_tag(tag: &str) -> bool {
    matches!(
        tag,
        "p" | "div"
            | "section"
            | "article"
            | "header"
            | "footer"
            | "main"
            | "aside"
            | "nav"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "li"
            | "ul"
            | "ol"
            | "tr"
            | "td"
            | "th"
            | "table"
            | "pre"
            | "blockquote"
            | "br"
            | "hr"
    )
}

fn normalize_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_blank = true;
    let mut last_space = false;
    for ch in s.chars() {
        if ch == '\n' {
            if !prev_blank {
                out.push('\n');
                prev_blank = true;
                last_space = false;
            }
        } else if ch.is_whitespace() {
            if !last_space && !prev_blank {
                out.push(' ');
                last_space = true;
            }
        } else {
            out.push(ch);
            prev_blank = false;
            last_space = false;
        }
    }
    while out.ends_with(|c: char| c.is_whitespace()) {
        out.pop();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_title_from_title_tag() {
        let html = b"<html><head><title>Dashboard</title></head><body><p>hi</p></body></html>";
        let res = extract_html_text(html);
        assert_eq!(res.title.as_deref(), Some("Dashboard"));
    }

    #[test]
    fn falls_back_to_first_h1_when_no_title() {
        let html = b"<html><body><h1>Hello World</h1><p>x</p></body></html>";
        let res = extract_html_text(html);
        assert_eq!(res.title.as_deref(), Some("Hello World"));
    }

    #[test]
    fn body_strips_tags_and_keeps_visible_text() {
        let html = br#"<html><body><p class="bg-blue-500">Visible text</p></body></html>"#;
        let res = extract_html_text(html);
        assert!(res.body.contains("Visible text"));
        assert!(!res.body.contains("bg-blue-500"));
        assert!(!res.body.contains("class"));
    }

    #[test]
    fn body_skips_script_and_style() {
        let html = br#"<html><body>
            <script>const SECRET_TOKEN = 1;</script>
            <style>.invisible { color: red; }</style>
            <p>Real content</p>
        </body></html>"#;
        let res = extract_html_text(html);
        assert!(res.body.contains("Real content"));
        assert!(!res.body.contains("SECRET_TOKEN"));
        assert!(!res.body.contains(".invisible"));
    }

    #[test]
    fn empty_input_yields_empty_extraction() {
        let res = extract_html_text(b"");
        assert!(res.title.is_none());
        assert!(res.body.is_empty());
    }

    #[test]
    fn block_tags_create_separators() {
        let html = b"<html><body><p>one</p><p>two</p></body></html>";
        let res = extract_html_text(html);
        // Words must not run together: "one two" or "one\ntwo", never "onetwo".
        assert!(!res.body.contains("onetwo"));
        assert!(res.body.contains("one"));
        assert!(res.body.contains("two"));
    }

    #[test]
    fn noscript_is_skipped() {
        let html = b"<html><body><noscript>js off</noscript><p>visible</p></body></html>";
        let res = extract_html_text(html);
        assert!(!res.body.contains("js off"));
        assert!(res.body.contains("visible"));
    }
}
