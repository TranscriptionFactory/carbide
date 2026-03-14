use serde::Deserialize;

#[derive(Deserialize)]
#[allow(dead_code)]
struct CanvasFile {
    #[serde(default)]
    nodes: Vec<CanvasNode>,
    #[serde(default)]
    edges: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct CanvasNode {
    #[serde(rename = "type")]
    node_type: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    file: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

pub struct CanvasContent {
    pub text_body: String,
    pub file_refs: Vec<String>,
    pub wiki_links: Vec<String>,
}

pub fn extract_canvas_content(json: &str) -> Result<CanvasContent, String> {
    let canvas: CanvasFile =
        serde_json::from_str(json).map_err(|e| format!("Failed to parse canvas JSON: {e}"))?;

    let mut text_body = String::new();
    let mut file_refs = Vec::new();
    let mut wiki_links = Vec::new();

    for node in &canvas.nodes {
        match node.node_type.as_str() {
            "text" => {
                if let Some(text) = &node.text {
                    if !text_body.is_empty() {
                        text_body.push('\n');
                    }
                    text_body.push_str(text);
                    extract_wiki_links_from_text(text, &mut wiki_links);
                }
            }
            "file" => {
                if let Some(file) = &node.file {
                    file_refs.push(file.clone());
                }
            }
            _ => {}
        }
    }

    file_refs.sort();
    file_refs.dedup();
    wiki_links.sort();
    wiki_links.dedup();

    Ok(CanvasContent {
        text_body,
        file_refs,
        wiki_links,
    })
}

fn extract_wiki_links_from_text(text: &str, out: &mut Vec<String>) {
    let mut rest = text;
    while let Some(start) = rest.find("[[") {
        rest = &rest[start + 2..];
        if let Some(end) = rest.find("]]") {
            let link_content = &rest[..end];
            let target = link_content.split('|').next().unwrap_or(link_content);
            let target = target.split('#').next().unwrap_or(target).trim();
            if !target.is_empty() {
                out.push(target.to_string());
            }
            rest = &rest[end + 2..];
        } else {
            break;
        }
    }
}

pub fn extract_all_link_targets(json: &str) -> Result<Vec<String>, String> {
    let content = extract_canvas_content(json)?;
    let mut targets = content.file_refs;
    for wiki in content.wiki_links {
        let normalized = if wiki.ends_with(".md") {
            wiki
        } else {
            format!("{wiki}.md")
        };
        targets.push(normalized);
    }
    targets.sort();
    targets.dedup();
    Ok(targets)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_text_body() {
        let json = r#"{
            "nodes": [
                {"id": "1", "type": "text", "text": "Hello world", "x": 0, "y": 0, "width": 200, "height": 100},
                {"id": "2", "type": "text", "text": "Second node", "x": 0, "y": 200, "width": 200, "height": 100}
            ],
            "edges": []
        }"#;

        let content = extract_canvas_content(json).unwrap();
        assert_eq!(content.text_body, "Hello world\nSecond node");
    }

    #[test]
    fn test_extract_file_refs() {
        let json = r#"{
            "nodes": [
                {"id": "1", "type": "file", "file": "notes/foo.md", "x": 0, "y": 0, "width": 200, "height": 100},
                {"id": "2", "type": "file", "file": "notes/bar.md", "x": 0, "y": 200, "width": 200, "height": 100}
            ],
            "edges": []
        }"#;

        let content = extract_canvas_content(json).unwrap();
        assert_eq!(content.file_refs, vec!["notes/bar.md", "notes/foo.md"]);
    }

    #[test]
    fn test_extract_wiki_links_from_text() {
        let json = r#"{
            "nodes": [
                {"id": "1", "type": "text", "text": "See [[My Note]] and [[Other#heading]]", "x": 0, "y": 0, "width": 200, "height": 100}
            ],
            "edges": []
        }"#;

        let content = extract_canvas_content(json).unwrap();
        assert_eq!(content.wiki_links, vec!["My Note", "Other"]);
    }

    #[test]
    fn test_extract_wiki_links_with_alias() {
        let json = r#"{
            "nodes": [
                {"id": "1", "type": "text", "text": "[[Real Note|Display Text]]", "x": 0, "y": 0, "width": 200, "height": 100}
            ],
            "edges": []
        }"#;

        let content = extract_canvas_content(json).unwrap();
        assert_eq!(content.wiki_links, vec!["Real Note"]);
    }

    #[test]
    fn test_extract_all_link_targets() {
        let json = r#"{
            "nodes": [
                {"id": "1", "type": "file", "file": "notes/foo.md", "x": 0, "y": 0, "width": 200, "height": 100},
                {"id": "2", "type": "text", "text": "See [[Bar]]", "x": 0, "y": 200, "width": 200, "height": 100}
            ],
            "edges": []
        }"#;

        let targets = extract_all_link_targets(json).unwrap();
        assert_eq!(targets, vec!["Bar.md", "notes/foo.md"]);
    }

    #[test]
    fn test_empty_canvas() {
        let json = r#"{"nodes": [], "edges": []}"#;
        let content = extract_canvas_content(json).unwrap();
        assert!(content.text_body.is_empty());
        assert!(content.file_refs.is_empty());
        assert!(content.wiki_links.is_empty());
    }

    #[test]
    fn test_deduplication() {
        let json = r#"{
            "nodes": [
                {"id": "1", "type": "file", "file": "notes/foo.md", "x": 0, "y": 0, "width": 200, "height": 100},
                {"id": "2", "type": "file", "file": "notes/foo.md", "x": 0, "y": 200, "width": 200, "height": 100}
            ],
            "edges": []
        }"#;

        let content = extract_canvas_content(json).unwrap();
        assert_eq!(content.file_refs.len(), 1);
    }
}
