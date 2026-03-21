use crate::features::tasks::service as tasks_service;
use crate::features::tasks::types::Task;
use crate::shared::frontmatter::{self, Frontmatter};
use crate::shared::link_parser::{self, ExternalLink, ParsedInternalLink};
use comrak::nodes::NodeValue;
use comrak::{parse_document, Arena, Options};
use regex::Regex;
use serde::Serialize;
use std::sync::LazyLock;

static INLINE_TAG_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:^|\s)#([a-zA-Z_][\w/-]*)").unwrap());

#[derive(Debug, Clone, Serialize)]
pub struct Heading {
    pub level: u8,
    pub text: String,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct InlineTag {
    pub tag: String,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct Section {
    pub heading_id: String,
    pub level: u8,
    pub title: String,
    pub start_line: usize,
    pub end_line: usize,
    pub word_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CodeBlockMeta {
    pub line: usize,
    pub language: Option<String>,
    pub length: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct NoteLinks {
    pub wiki_targets: Vec<ParsedInternalLink>,
    pub markdown_targets: Vec<ParsedInternalLink>,
    pub external_links: Vec<ExternalLink>,
}

impl NoteLinks {
    pub fn all_internal_targets(&self) -> Vec<String> {
        let mut out: Vec<String> = self
            .markdown_targets
            .iter()
            .map(|l| l.target_path.clone())
            .collect();
        out.extend(self.wiki_targets.iter().map(|l| l.target_path.clone()));
        out
    }
}

#[derive(Debug, Clone)]
pub struct ParsedNote {
    pub frontmatter: Frontmatter,
    pub title: Option<String>,
    pub headings: Vec<Heading>,
    pub links: NoteLinks,
    pub tasks: Vec<Task>,
    pub word_count: i64,
    pub char_count: i64,
    pub heading_count: i64,
    pub reading_time_secs: i64,
    pub inline_tags: Vec<InlineTag>,
    pub sections: Vec<Section>,
    pub code_blocks: Vec<CodeBlockMeta>,
}

fn slugify(text: &str) -> String {
    text.chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else if c == ' ' || c == '-' || c == '_' {
                '-'
            } else {
                '\0'
            }
        })
        .filter(|&c| c != '\0')
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn compute_sections(headings: &[Heading], total_lines: usize, all_lines: &[&str]) -> Vec<Section> {
    if headings.is_empty() {
        return Vec::new();
    }

    headings
        .iter()
        .enumerate()
        .map(|(i, h)| {
            let end_line = headings[i + 1..]
                .iter()
                .find(|next| next.level <= h.level)
                .map(|next| next.line - 1)
                .unwrap_or(total_lines);

            let start_idx = h.line.saturating_sub(1);
            let end_idx = end_line.min(all_lines.len());
            let wc: i64 = (start_idx..end_idx)
                .map(|li| {
                    all_lines
                        .get(li)
                        .map_or(0, |l| l.split_whitespace().count())
                })
                .sum::<usize>() as i64;

            Section {
                heading_id: slugify(&h.text),
                level: h.level,
                title: h.text.clone(),
                start_line: h.line,
                end_line,
                word_count: wc,
            }
        })
        .collect()
}

pub fn markdown_options() -> Options<'static> {
    let mut options = Options::default();
    options.extension.autolink = true;
    options.extension.table = true;
    options.extension.tasklist = true;
    options.extension.strikethrough = true;
    options.extension.wikilinks_title_after_pipe = true;
    options
}

pub fn parse_note(markdown: &str, source_path: &str) -> ParsedNote {
    let (yaml_slice, body) = frontmatter::split_frontmatter(markdown);
    let fm = match yaml_slice {
        Some(yaml) => frontmatter::parse_yaml_frontmatter(yaml),
        None => Frontmatter::default(),
    };

    let word_count = body.split_whitespace().count() as i64;
    let char_count = body.len() as i64;

    let fm_line_offset = if body.len() < markdown.len() {
        markdown[..markdown.len() - body.len()].lines().count()
    } else {
        0
    };

    // Parse stripped body (not full markdown) to avoid comrak misinterpreting
    // frontmatter `---` as setext heading underlines
    let arena = Arena::new();
    let options = markdown_options();
    let root = parse_document(&arena, body, &options);

    let mut headings = Vec::new();
    let mut links = NoteLinks::default();
    let mut title: Option<String> = None;
    let mut inline_tags = Vec::new();
    let mut code_blocks = Vec::new();

    for node in root.descendants() {
        let data = node.data.borrow();
        match &data.value {
            NodeValue::Heading(h) => {
                let text = link_parser::collect_plain_text(node);
                if title.is_none() && h.level == 1 {
                    title = Some(text.clone());
                }
                headings.push(Heading {
                    level: h.level,
                    text,
                    line: data.sourcepos.start.line + fm_line_offset,
                });
            }
            NodeValue::Link(link) => {
                if link_parser::is_external_url(&link.url) {
                    let text = link_parser::collect_plain_text(node);
                    let label = if text.is_empty() {
                        link.url.clone()
                    } else {
                        text
                    };
                    links.external_links.push(ExternalLink {
                        url: link.url.clone(),
                        text: label,
                    });
                } else if let Some(target) = link_parser::parse_link_node(link, source_path) {
                    let anchor = link_parser::extract_anchor(&link.url);
                    let line = data.sourcepos.start.line + fm_line_offset;
                    links.markdown_targets.push(ParsedInternalLink {
                        target_path: target,
                        anchor,
                        line,
                    });
                }
            }
            NodeValue::WikiLink(link) => {
                if !link_parser::is_embedded_wikilink(node) {
                    if let Some(target) = link_parser::parse_wikilink_node(link, source_path) {
                        let anchor = link_parser::extract_anchor(&link.url);
                        let line = data.sourcepos.start.line + fm_line_offset;
                        links.wiki_targets.push(ParsedInternalLink {
                            target_path: target,
                            anchor,
                            line,
                        });
                    }
                }
            }
            NodeValue::Text(ref text) => {
                let in_heading = node
                    .parent()
                    .is_some_and(|p| matches!(p.data.borrow().value, NodeValue::Heading(_)));
                if !in_heading {
                    let line = data.sourcepos.start.line + fm_line_offset;
                    for cap in INLINE_TAG_RE.captures_iter(text) {
                        inline_tags.push(InlineTag {
                            tag: cap[1].to_string(),
                            line,
                        });
                    }
                }
            }
            NodeValue::CodeBlock(cb) => {
                let lang = cb.info.trim().split_whitespace().next().map(String::from);
                let lang = lang.filter(|l| !l.is_empty());
                let line = data.sourcepos.start.line + fm_line_offset;
                let length = data.sourcepos.end.line - data.sourcepos.start.line + 1;
                code_blocks.push(CodeBlockMeta {
                    line,
                    language: lang,
                    length,
                });
            }
            _ => {}
        }
    }

    let heading_count = headings.len() as i64;
    let reading_time_secs = (word_count as f64 / 238.0 * 60.0) as i64;

    let tasks = tasks_service::extract_tasks(source_path, body);

    let sections = if headings.is_empty() {
        Vec::new()
    } else {
        let all_lines: Vec<&str> = markdown.lines().collect();
        compute_sections(&headings, all_lines.len(), &all_lines)
    };

    ParsedNote {
        frontmatter: fm,
        title,
        headings,
        links,
        tasks,
        word_count,
        char_count,
        heading_count,
        reading_time_secs,
        inline_tags,
        sections,
        code_blocks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_note_with_frontmatter_and_heading() {
        let md = "---\ntags: [rust]\nstatus: draft\n---\n# My Title\n\nSome body text here.";
        let parsed = parse_note(md, "notes/test.md");

        assert_eq!(parsed.frontmatter.tags, vec!["rust"]);
        assert_eq!(
            parsed.frontmatter.properties["status"].as_str(),
            Some("draft")
        );
        assert_eq!(parsed.title, Some("My Title".to_string()));
        assert_eq!(parsed.headings.len(), 1);
        assert_eq!(parsed.headings[0].level, 1);
        assert_eq!(parsed.headings[0].text, "My Title");
    }

    #[test]
    fn parse_note_no_frontmatter() {
        let md = "# Title\n\nBody content.";
        let parsed = parse_note(md, "test.md");

        assert!(parsed.frontmatter.tags.is_empty());
        assert!(parsed.frontmatter.properties.is_empty());
        assert_eq!(parsed.title, Some("Title".to_string()));
        assert!(parsed.word_count > 0);
    }

    #[test]
    fn parse_note_multiple_headings() {
        let md = "# H1\n## H2\n### H3\n## Another H2";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.heading_count, 4);
        assert_eq!(parsed.title, Some("H1".to_string()));
        assert_eq!(parsed.headings[1].level, 2);
        assert_eq!(parsed.headings[1].text, "H2");
    }

    #[test]
    fn parse_note_title_fallback_when_no_h1() {
        let md = "## Only H2\n\nBody text.";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.title, None);
        assert_eq!(parsed.heading_count, 1);
    }

    #[test]
    fn parse_note_wiki_links() {
        let md = "See [[Other Note]] and [[folder/Deep Note]].";
        let parsed = parse_note(md, "notes/test.md");

        let paths: Vec<&str> = parsed
            .links
            .wiki_targets
            .iter()
            .map(|l| l.target_path.as_str())
            .collect();
        assert!(paths.contains(&"Other Note.md"));
        assert!(paths.contains(&"folder/Deep Note.md"));
    }

    #[test]
    fn parse_note_markdown_links() {
        let md = "See [link](./other.md) and [ext](https://example.com).";
        let parsed = parse_note(md, "notes/test.md");

        let paths: Vec<&str> = parsed
            .links
            .markdown_targets
            .iter()
            .map(|l| l.target_path.as_str())
            .collect();
        assert!(paths.contains(&"notes/other.md"));
        assert_eq!(parsed.links.external_links.len(), 1);
        assert_eq!(parsed.links.external_links[0].url, "https://example.com");
    }

    #[test]
    fn parse_note_tasks() {
        let md = "# Tasks\n- [ ] Todo item\n- [x] Done item\n- [/] In progress";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.tasks.len(), 3);
    }

    #[test]
    fn parse_note_stats() {
        let md = "---\ntitle: Test\n---\nOne two three four five.";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.word_count, 5);
        assert!(parsed.char_count > 0);
        assert_eq!(parsed.heading_count, 0);
        assert!(parsed.reading_time_secs >= 0);
    }

    #[test]
    fn parse_note_empty() {
        let parsed = parse_note("", "test.md");

        assert!(parsed.frontmatter.tags.is_empty());
        assert_eq!(parsed.title, None);
        assert!(parsed.headings.is_empty());
        assert_eq!(parsed.word_count, 0);
        assert!(parsed.tasks.is_empty());
    }

    #[test]
    fn parse_note_embedded_wikilink_excluded() {
        let md = "![[embedded image]] and [[normal link]]";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.links.wiki_targets.len(), 1);
        assert_eq!(parsed.links.wiki_targets[0].target_path, "normal link.md");
    }

    #[test]
    fn all_internal_targets_combines_both() {
        let md = "[[wiki]] and [md](./other.md)";
        let parsed = parse_note(md, "notes/test.md");

        let all = parsed.links.all_internal_targets();
        assert!(all.contains(&"wiki.md".to_string()));
        assert!(all.contains(&"notes/other.md".to_string()));
    }

    #[test]
    fn wiki_link_with_heading_anchor() {
        let md = "See [[Other Note#Design]] here.";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.links.wiki_targets.len(), 1);
        assert_eq!(parsed.links.wiki_targets[0].target_path, "Other Note.md");
        assert_eq!(
            parsed.links.wiki_targets[0].anchor.as_deref(),
            Some("Design")
        );
    }

    #[test]
    fn markdown_link_with_heading_anchor() {
        let md = "See [link](./other.md#setup) here.";
        let parsed = parse_note(md, "notes/test.md");

        assert_eq!(parsed.links.markdown_targets.len(), 1);
        assert_eq!(
            parsed.links.markdown_targets[0].target_path,
            "notes/other.md"
        );
        assert_eq!(
            parsed.links.markdown_targets[0].anchor.as_deref(),
            Some("setup")
        );
    }

    #[test]
    fn link_without_anchor_has_none() {
        let md = "See [[Plain Note]] here.";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.links.wiki_targets.len(), 1);
        assert!(parsed.links.wiki_targets[0].anchor.is_none());
    }

    #[test]
    fn link_captures_source_line() {
        let md = "---\ntitle: Test\n---\nLine one.\n\n[[Target#heading]]";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.links.wiki_targets.len(), 1);
        assert!(parsed.links.wiki_targets[0].line > 1);
    }

    #[test]
    fn inline_tags_extracted_from_body() {
        let md = "Some text #status/active and #project/carbide here.";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.inline_tags.len(), 2);
        assert_eq!(parsed.inline_tags[0].tag, "status/active");
        assert_eq!(parsed.inline_tags[1].tag, "project/carbide");
    }

    #[test]
    fn inline_tags_not_extracted_from_headings() {
        let md = "# Heading with #tag\n\nBody #real-tag here.";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.inline_tags.len(), 1);
        assert_eq!(parsed.inline_tags[0].tag, "real-tag");
    }

    #[test]
    fn inline_tags_not_extracted_from_code_blocks() {
        let md = "Text #visible\n\n```\n#not-a-tag\n```\n\nMore #also-visible.";
        let parsed = parse_note(md, "test.md");

        let tags: Vec<&str> = parsed.inline_tags.iter().map(|t| t.tag.as_str()).collect();
        assert!(tags.contains(&"visible"));
        assert!(tags.contains(&"also-visible"));
        assert!(!tags.contains(&"not-a-tag"));
    }

    #[test]
    fn inline_tags_require_word_boundary() {
        let md = "email@#notag and foo#bar should not match, but #real should.";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.inline_tags.len(), 1);
        assert_eq!(parsed.inline_tags[0].tag, "real");
    }

    #[test]
    fn inline_tags_hierarchical() {
        let md = "#top-level and #nested/sub/deep";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.inline_tags.len(), 2);
        assert_eq!(parsed.inline_tags[0].tag, "top-level");
        assert_eq!(parsed.inline_tags[1].tag, "nested/sub/deep");
    }

    #[test]
    fn inline_tags_reject_numeric_only() {
        let md = "Step #2 and item #123 should not match, but #v2 and #_internal should.";
        let parsed = parse_note(md, "test.md");

        let tags: Vec<&str> = parsed.inline_tags.iter().map(|t| t.tag.as_str()).collect();
        assert!(!tags.contains(&"2"));
        assert!(!tags.contains(&"123"));
        assert!(tags.contains(&"v2"));
        assert!(tags.contains(&"_internal"));
    }

    #[test]
    fn inline_tags_reject_digit_leading() {
        let md = "Plan #2024-roadmap should not match, but #roadmap-2024 should.";
        let parsed = parse_note(md, "test.md");

        let tags: Vec<&str> = parsed.inline_tags.iter().map(|t| t.tag.as_str()).collect();
        assert!(!tags.contains(&"2024-roadmap"));
        assert!(tags.contains(&"roadmap-2024"));
    }

    #[test]
    fn sections_computed_from_headings() {
        let md = "# H1\nSome text\n## H2a\nMore text here\n## H2b\nFinal text";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.sections.len(), 3);
        assert_eq!(parsed.sections[0].heading_id, "h1");
        assert_eq!(parsed.sections[0].level, 1);
        assert_eq!(parsed.sections[0].end_line, 6);
        assert_eq!(parsed.sections[1].heading_id, "h2a");
        assert_eq!(parsed.sections[1].level, 2);
        assert_eq!(parsed.sections[1].start_line, 3);
        assert_eq!(parsed.sections[1].end_line, 4);
        assert_eq!(parsed.sections[2].heading_id, "h2b");
    }

    #[test]
    fn sections_empty_when_no_headings() {
        let md = "Just body text, no headings.";
        let parsed = parse_note(md, "test.md");
        assert!(parsed.sections.is_empty());
    }

    #[test]
    fn code_blocks_extracted() {
        let md = "# Title\n\n```rust\nfn main() {}\n```\n\n```mermaid\ngraph TD\n  A --> B\n```";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.code_blocks.len(), 2);
        assert_eq!(parsed.code_blocks[0].language, Some("rust".to_string()));
        assert_eq!(parsed.code_blocks[1].language, Some("mermaid".to_string()));
    }

    #[test]
    fn code_blocks_no_language() {
        let md = "```\nplain code\n```";
        let parsed = parse_note(md, "test.md");

        assert_eq!(parsed.code_blocks.len(), 1);
        assert_eq!(parsed.code_blocks[0].language, None);
    }

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("Hello World"), "hello-world");
        assert_eq!(slugify("My  Title!!"), "my-title");
        assert_eq!(slugify("kebab-case"), "kebab-case");
        assert_eq!(slugify("with_underscores"), "with-underscores");
    }
}
