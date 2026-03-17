use crate::shared::frontmatter::{self, Frontmatter};
use crate::shared::link_parser::{self, ExternalLink};
use crate::features::tasks::service as tasks_service;
use crate::features::tasks::types::Task;
use comrak::nodes::NodeValue;
use comrak::{parse_document, Arena, Options};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Heading {
    pub level: u8,
    pub text: String,
    pub line: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct NoteLinks {
    pub wiki_targets: Vec<String>,
    pub markdown_targets: Vec<String>,
    pub external_links: Vec<ExternalLink>,
}

impl NoteLinks {
    pub fn all_internal_targets(&self) -> Vec<String> {
        let mut out = self.markdown_targets.clone();
        out.extend(self.wiki_targets.iter().cloned());
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
                    links.markdown_targets.push(target);
                }
            }
            NodeValue::WikiLink(link) => {
                if !link_parser::is_embedded_wikilink(node) {
                    if let Some(target) =
                        link_parser::parse_wikilink_node(link, source_path)
                    {
                        links.wiki_targets.push(target);
                    }
                }
            }
            _ => {}
        }
    }

    let heading_count = headings.len() as i64;
    let reading_time_secs = (word_count as f64 / 238.0 * 60.0) as i64;

    let tasks = tasks_service::extract_tasks(source_path, body);

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

        assert!(parsed.links.wiki_targets.contains(&"Other Note.md".to_string()));
        assert!(parsed
            .links
            .wiki_targets
            .contains(&"folder/Deep Note.md".to_string()));
    }

    #[test]
    fn parse_note_markdown_links() {
        let md = "See [link](./other.md) and [ext](https://example.com).";
        let parsed = parse_note(md, "notes/test.md");

        assert!(parsed
            .links
            .markdown_targets
            .contains(&"notes/other.md".to_string()));
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
        assert!(parsed
            .links
            .wiki_targets
            .contains(&"normal link.md".to_string()));
    }

    #[test]
    fn all_internal_targets_combines_both() {
        let md = "[[wiki]] and [md](./other.md)";
        let parsed = parse_note(md, "notes/test.md");

        let all = parsed.links.all_internal_targets();
        assert!(all.contains(&"wiki.md".to_string()));
        assert!(all.contains(&"notes/other.md".to_string()));
    }
}
