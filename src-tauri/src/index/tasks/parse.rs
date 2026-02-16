use super::types::ParsedTask;

struct TaskLineMatch {
    leading_ws: usize,
    text_start: usize,
    marker: char,
    checked: bool,
}

fn parse_task_line(line: &str) -> Option<TaskLineMatch> {
    let mut ws = 0usize;
    for ch in line.chars() {
        if ch == ' ' || ch == '\t' {
            ws += ch.len_utf8();
        } else {
            break;
        }
    }
    let rest = &line[ws..];
    let bytes = rest.as_bytes();
    if bytes.len() < 6 {
        return None;
    }
    let marker = bytes[0] as char;
    if marker != '-' && marker != '*' && marker != '+' {
        return None;
    }
    if bytes[1] != b' ' || bytes[2] != b'[' || bytes[4] != b']' || bytes[5] != b' ' {
        return None;
    }
    let status = bytes[3] as char;
    if status != ' ' && status != 'x' && status != 'X' {
        return None;
    }
    Some(TaskLineMatch {
        leading_ws: ws,
        text_start: ws + 6,
        marker,
        checked: status == 'x' || status == 'X',
    })
}

pub fn is_valid_date(date: &str) -> bool {
    let bytes = date.as_bytes();
    if bytes.len() != 10 {
        return false;
    }
    for (i, b) in bytes.iter().enumerate() {
        if i == 4 || i == 7 {
            if *b != b'-' {
                return false;
            }
        } else if !b.is_ascii_digit() {
            return false;
        }
    }
    let year = date[0..4].parse::<i32>().ok();
    let month = date[5..7].parse::<u32>().ok();
    let day = date[8..10].parse::<u32>().ok();
    let (Some(year), Some(month), Some(day)) = (year, month, day) else {
        return false;
    };
    if !(1..=12).contains(&month) {
        return false;
    }
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
            if leap {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    day >= 1 && day <= max_day
}

fn split_tokens(raw_text: &str) -> Vec<&str> {
    raw_text
        .split_whitespace()
        .filter(|t| !t.is_empty())
        .collect()
}

fn extract_task_metadata(raw_text: &str) -> (Option<String>, Option<String>, Vec<String>) {
    let tokens = split_tokens(raw_text);
    let mut due_date = None;
    let mut scheduled_date = None;
    let mut tags = Vec::new();
    let mut i = 0usize;
    while i < tokens.len() {
        let t = tokens[i];
        if t == "📅" && i + 1 < tokens.len() && is_valid_date(tokens[i + 1]) {
            due_date = Some(tokens[i + 1].to_string());
            i += 2;
            continue;
        }
        if t == "⏳" && i + 1 < tokens.len() && is_valid_date(tokens[i + 1]) {
            scheduled_date = Some(tokens[i + 1].to_string());
            i += 2;
            continue;
        }
        if t.starts_with('#') && t.len() > 1 {
            tags.push(t.to_string());
        }
        i += 1;
    }
    (due_date, scheduled_date, tags)
}

pub fn strip_schedule_tokens(raw_text: &str) -> String {
    let tokens = split_tokens(raw_text);
    let mut kept: Vec<&str> = Vec::new();
    let mut i = 0usize;
    while i < tokens.len() {
        let t = tokens[i];
        if (t == "📅" || t == "⏳") && i + 1 < tokens.len() && is_valid_date(tokens[i + 1]) {
            i += 2;
            continue;
        }
        kept.push(t);
        i += 1;
    }
    kept.join(" ")
}

pub fn apply_task_metadata(
    line: &str,
    checked: Option<bool>,
    scheduled_date: Option<&str>,
    due_date: Option<&str>,
) -> Option<String> {
    let m = parse_task_line(line)?;
    let clean = strip_schedule_tokens(line[m.text_start..].trim());
    let mut body = clean;
    if let Some(v) = scheduled_date.filter(|d| is_valid_date(d)) {
        if !body.is_empty() {
            body.push(' ');
        }
        body.push_str("⏳ ");
        body.push_str(v);
    }
    if let Some(v) = due_date.filter(|d| is_valid_date(d)) {
        if !body.is_empty() {
            body.push(' ');
        }
        body.push_str("📅 ");
        body.push_str(v);
    }

    let status = if checked.unwrap_or(m.checked) {
        'x'
    } else {
        ' '
    };
    let indent = &line[..m.leading_ws];
    Some(format!("{indent}{} [{}] {}", m.marker, status, body.trim()))
}

pub fn parse_tasks(markdown: &str) -> Vec<ParsedTask> {
    let mut out = Vec::new();
    let mut headings: Vec<String> = Vec::new();
    let mut levels: Vec<(i64, i64)> = Vec::new();

    for (idx, line) in markdown.lines().enumerate() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('#') {
            let level = trimmed.chars().take_while(|c| *c == '#').count();
            if level > 0 && trimmed.chars().nth(level) == Some(' ') {
                while headings.len() >= level {
                    headings.pop();
                }
                headings.push(trimmed[(level + 1)..].trim().to_string());
            }
        }

        let Some(m) = parse_task_line(line) else {
            continue;
        };

        let indent = m.leading_ws as i64;
        while levels.last().map(|(n, _)| *n > indent).unwrap_or(false) {
            levels.pop();
        }
        match levels.last_mut() {
            Some((n, c)) if *n == indent => *c += 1,
            _ => levels.push((indent, 0)),
        }

        let list_path = levels
            .iter()
            .map(|(_, i)| i.to_string())
            .collect::<Vec<_>>()
            .join(".");
        let raw_text = line[m.text_start..].trim().to_string();
        let text_norm = strip_schedule_tokens(&raw_text);
        let (due_date, scheduled_date, tags) = extract_task_metadata(&raw_text);

        out.push(ParsedTask {
            line_start: idx as i64 + 1,
            list_path,
            indent,
            raw_text,
            text_norm: text_norm.clone(),
            checked: m.checked,
            status: if m.checked { "done" } else { "todo" }.to_string(),
            due_date,
            scheduled_date,
            tags,
            section: if headings.is_empty() {
                None
            } else {
                Some(headings.join(" / "))
            },
        });
    }

    out
}
