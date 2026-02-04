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
    let (yaml, _body) = split_frontmatter(markdown);
    if yaml.is_empty() {
        return Vec::new();
    }
    let v: serde_yaml::Value = match serde_yaml::from_str(yaml) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let tags_val = match v.get("tags") {
        Some(t) => t,
        None => return Vec::new(),
    };
    let mut out = Vec::new();
    match tags_val {
        serde_yaml::Value::Sequence(items) => {
            for it in items {
                if let serde_yaml::Value::String(s) = it {
                    if let Some(t) = normalize_tag(s) {
                        out.push(t);
                    }
                }
            }
        }
        serde_yaml::Value::String(s) => {
            let parts = if s.contains(',') {
                s.split(',').map(|p| p.trim()).collect::<Vec<_>>()
            } else {
                s.split_whitespace().collect::<Vec<_>>()
            };
            for p in parts {
                if let Some(t) = normalize_tag(p) {
                    out.push(t);
                }
            }
        }
        _ => {}
    }
    out.sort();
    out.dedup();
    out
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
