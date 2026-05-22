use std::{
    collections::{HashMap, HashSet},
    path::Path,
};

use serde::Deserialize;

use super::links::normalize_rel_path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlowFileEdge {
    pub from_id: String,
    pub to_id: String,
    pub label: Option<String>,
    pub ordinal: i64,
}

#[derive(Debug, Clone, Default)]
pub struct FlowIndexData {
    pub body: String,
    pub preview: String,
    pub file_links: HashSet<String>,
    pub url_links: HashSet<String>,
    pub file_edges: Vec<FlowFileEdge>,
}

#[derive(Deserialize)]
struct FlowDocument {
    #[serde(default)]
    nodes: Vec<FlowNode>,
    #[serde(default)]
    edges: Vec<FlowEdge>,
}

#[derive(Deserialize)]
struct FlowNode {
    id: Option<String>,
    #[serde(rename = "type")]
    node_type: Option<String>,
    text: Option<String>,
    file: Option<String>,
    url: Option<String>,
    label: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlowEdge {
    from_node: Option<String>,
    to_node: Option<String>,
    label: Option<String>,
}

pub fn is_flow_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("flow"))
        .unwrap_or(false)
}

pub fn parse_flow_index_data(flow_json: &str) -> Result<FlowIndexData, String> {
    let doc: FlowDocument = serde_json::from_str(flow_json).map_err(|e| e.to_string())?;
    let mut text_parts = Vec::new();
    let mut file_links = HashSet::new();
    let mut url_links = HashSet::new();
    let mut file_by_node_id = HashMap::<String, String>::new();

    for node in &doc.nodes {
        if let Some(label) = node
            .label
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            text_parts.push(label.to_string());
        }

        match node.node_type.as_deref() {
            Some("text") => {
                if let Some(text) = node
                    .text
                    .as_deref()
                    .map(str::trim)
                    .filter(|v| !v.is_empty())
                {
                    text_parts.push(text.to_string());
                }
            }
            Some("file") => {
                if let (Some(node_id), Some(file)) = (
                    node.id.as_deref(),
                    node.file.as_deref().and_then(normalize_flow_file_ref),
                ) {
                    text_parts.push(file.clone());
                    file_links.insert(file.clone());
                    file_by_node_id.insert(node_id.to_string(), file);
                }
            }
            Some("link") => {
                if let Some(url) = node.url.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
                    text_parts.push(url.to_string());
                    url_links.insert(url.to_string());
                }
            }
            _ => {}
        }
    }

    let mut file_edges = Vec::new();
    for (ordinal, edge) in doc.edges.iter().enumerate() {
        if let Some(label) = edge
            .label
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            text_parts.push(label.to_string());
        }

        let Some(from_node) = edge.from_node.as_deref() else {
            continue;
        };
        let Some(to_node) = edge.to_node.as_deref() else {
            continue;
        };
        let Some(from_id) = file_by_node_id.get(from_node) else {
            continue;
        };
        let Some(to_id) = file_by_node_id.get(to_node) else {
            continue;
        };
        if from_id == to_id {
            continue;
        }
        file_edges.push(FlowFileEdge {
            from_id: from_id.clone(),
            to_id: to_id.clone(),
            label: edge.label.as_ref().map(|label| label.trim().to_string()),
            ordinal: ordinal as i64,
        });
    }

    let body = compact_text(&text_parts.join("\n"));
    let preview = preview_from_body(&body);
    Ok(FlowIndexData {
        body,
        preview,
        file_links,
        url_links,
        file_edges,
    })
}

fn normalize_flow_file_ref(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_matches('/');
    if trimmed.is_empty() || has_uri_scheme(trimmed) {
        return None;
    }
    let without_fragment = trimmed.split('#').next().unwrap_or(trimmed);
    let without_query = without_fragment
        .split('?')
        .next()
        .unwrap_or(without_fragment);
    normalize_rel_path(without_query)
}

fn has_uri_scheme(target: &str) -> bool {
    let Some((scheme, _rest)) = target.split_once(':') else {
        return false;
    };
    !scheme.is_empty()
        && scheme
            .chars()
            .next()
            .is_some_and(|value| value.is_ascii_alphabetic())
        && scheme
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '+' | '.' | '-'))
}

fn compact_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn preview_from_body(body: &str) -> String {
    const MAX_PREVIEW_CHARS: usize = 240;
    let mut preview = body.chars().take(MAX_PREVIEW_CHARS).collect::<String>();
    if body.chars().count() > MAX_PREVIEW_CHARS {
        preview.push_str("...");
    }
    preview
}

#[cfg(test)]
mod tests {
    use super::parse_flow_index_data;

    #[test]
    fn parses_flow_text_files_links_and_file_edges() {
        let data = parse_flow_index_data(
            r#"{
              "nodes": [
                {"id":"text-1","type":"text","text":"Launch notes"},
                {"id":"file-1","type":"file","file":"Projects/A.md"},
                {"id":"file-2","type":"file","file":"Projects/B.md#Heading"},
                {"id":"link-1","type":"link","url":"https://example.com"}
              ],
              "edges": [
                {"id":"edge-1","fromNode":"file-1","toNode":"file-2","label":"depends"}
              ]
            }"#,
        )
        .unwrap();

        assert!(data.body.contains("Launch notes"));
        assert!(data.body.contains("https://example.com"));
        assert!(data.file_links.contains("Projects/A.md"));
        assert!(data.file_links.contains("Projects/B.md"));
        assert_eq!(data.url_links.len(), 1);
        assert_eq!(data.file_edges.len(), 1);
        assert_eq!(data.file_edges[0].from_id, "Projects/A.md");
        assert_eq!(data.file_edges[0].to_id, "Projects/B.md");
    }
}
