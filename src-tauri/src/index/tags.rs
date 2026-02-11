use super::frontmatter::split_frontmatter;

pub fn normalize_tag(raw: &str) -> Option<String> {
    let t = raw.trim();
    if t.is_empty() {
        return None;
    }
    let t = t.strip_prefix('#').unwrap_or(t).trim();
    if t.is_empty() {
        return None;
    }
    let t = t.to_lowercase();
    if t.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '/')
    {
        Some(t)
    } else {
        None
    }
}

pub fn parse_frontmatter_tags(markdown: &str) -> Vec<String> {
    let markdown = markdown.strip_prefix('\u{feff}').unwrap_or(markdown);
    let (yaml, _body) = split_frontmatter(markdown);
    if yaml.is_empty() {
        return Vec::new();
    }
    let v: serde_yaml::Value = match serde_yaml::from_str(yaml) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let mut out = Vec::new();
    if let Some(tags_val) = extract_tags_value(&v) {
        collect_tags_from_yaml_value(tags_val, &mut out);
    }
    out.sort();
    out.dedup();
    out
}

fn extract_tags_value(value: &serde_yaml::Value) -> Option<&serde_yaml::Value> {
    let map = value.as_mapping()?;
    map.iter().find_map(|(key, val)| {
        key.as_str()
            .map(|k| k.eq_ignore_ascii_case("tags"))
            .filter(|matched| *matched)
            .map(|_| val)
    })
}

fn collect_tags_from_yaml_value(value: &serde_yaml::Value, out: &mut Vec<String>) {
    match value {
        serde_yaml::Value::Sequence(items) => {
            for item in items {
                collect_tags_from_yaml_value(item, out);
            }
        }
        serde_yaml::Value::String(s) => {
            collect_tags_from_string(s, out);
        }
        serde_yaml::Value::Number(n) => {
            if let Some(t) = normalize_tag(&n.to_string()) {
                out.push(t);
            }
        }
        _ => {}
    }
}

fn collect_tags_from_string(raw: &str, out: &mut Vec<String>) {
    let parts = if raw.contains(',') {
        raw.split(',').map(|p| p.trim()).collect::<Vec<_>>()
    } else {
        raw.split_whitespace().collect::<Vec<_>>()
    };
    for part in parts {
        if let Some(t) = normalize_tag(part) {
            out.push(t);
        }
    }
}

pub fn parse_inline_tags(markdown: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut in_fence = false;
    for line in markdown.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        let mut cleaned = String::new();
        let mut in_code = false;
        for ch in line.chars() {
            if ch == '`' {
                in_code = !in_code;
                continue;
            }
            if !in_code {
                cleaned.push(ch);
            }
        }

        let bytes = cleaned.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'#' {
                let prev = if i == 0 { b' ' } else { bytes[i - 1] };
                let prev_ok =
                    !(prev as char).is_ascii_alphanumeric() && prev != b'/' && prev != b'_';
                if !prev_ok {
                    i += 1;
                    continue;
                }
                let mut j = i + 1;
                while j < bytes.len() {
                    let c = bytes[j] as char;
                    if c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '/' {
                        j += 1;
                        continue;
                    }
                    break;
                }
                if j > i + 1 {
                    let candidate = &cleaned[i + 1..j];
                    if let Some(t) = normalize_tag(candidate) {
                        out.push(t);
                    }
                }
                i = j;
                continue;
            }
            i += 1;
        }
    }
    out.sort();
    out.dedup();
    out
}

pub fn parse_all_tags(markdown: &str) -> Vec<String> {
    let mut out = parse_frontmatter_tags(markdown);
    out.extend(parse_inline_tags(markdown));
    out.sort();
    out.dedup();
    out
}
