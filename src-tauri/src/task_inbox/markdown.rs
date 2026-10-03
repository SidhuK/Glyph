use chrono::{DateTime, Datelike, Days, FixedOffset, Months, NaiveDate, Timelike};
use regex::Regex;
use std::sync::LazyLock;

use super::types::{Recurrence, Schedule, TaskEdit};
use crate::index::checklists::parse_checklist_items;

// Plain Markdown tokens survive editor round trips and daily-note rollover.
static TOKEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:^| )@(due|repeat|remind)\(([^()\r\n]*)\)").expect("task token regex")
});

pub fn metadata(text: &str) -> (String, Schedule) {
    let due = TOKEN
        .captures_iter(text)
        .filter(|capture| &capture[1] == "due" && date(&capture[2]).is_ok())
        .last()
        .map(|capture| capture[2].to_string());
    let mut recurrence = None;
    let mut reminder_at = None;
    let title = TOKEN.replace_all(text, |capture: &regex::Captures<'_>| {
        let value = &capture[2];
        let recognized = match &capture[1] {
            "due" => date(value).is_ok(),
            "remind" => match reminder(value) {
                Ok(value) => {
                    reminder_at = Some(value.to_rfc3339());
                    true
                }
                Err(_) => false,
            },
            "repeat" if due.is_some() => {
                let parsed = match value {
                    "daily" => Some(Recurrence::Daily),
                    "weekly" => Some(Recurrence::Weekly),
                    "monthly" => Some(Recurrence::Monthly),
                    _ => None,
                };
                if parsed.is_some() {
                    recurrence = parsed;
                }
                parsed.is_some()
            }
            _ => false,
        };
        if recognized {
            String::new()
        } else {
            capture[0].to_string()
        }
    });
    let schedule = match due {
        Some(due) => Schedule::Dated {
            due,
            recurrence,
            reminder: reminder_at,
        },
        None => Schedule::Unscheduled {
            reminder: reminder_at,
        },
    };
    (title.trim().to_string(), schedule)
}

fn date(value: &str) -> Result<NaiveDate, String> {
    let parsed = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| "invalid task due date".to_string())?;
    if !(1..=9999).contains(&parsed.year()) || parsed.format("%Y-%m-%d").to_string() != value {
        return Err("invalid task due date".to_string());
    }
    Ok(parsed)
}

fn reminder(value: &str) -> Result<DateTime<FixedOffset>, String> {
    let parsed =
        DateTime::parse_from_rfc3339(value).map_err(|_| "invalid task reminder".to_string())?;
    // Browser date inputs cannot represent leap seconds or extended years.
    if !(1..=9999).contains(&parsed.year()) || parsed.nanosecond() >= 1_000_000_000 {
        return Err("invalid task reminder".into());
    }
    Ok(parsed)
}

fn suffix(schedule: &Schedule) -> Result<String, String> {
    let mut result = String::new();
    if let Schedule::Dated {
        due, recurrence, ..
    } = schedule
    {
        date(due)?;
        result.push_str(&format!(" @due({due})"));
        if let Some(recurrence) = recurrence {
            let name = match recurrence {
                Recurrence::Daily => "daily",
                Recurrence::Weekly => "weekly",
                Recurrence::Monthly => "monthly",
            };
            result.push_str(&format!(" @repeat({name})"));
        }
    }
    if let Some(value) = schedule.reminder() {
        let parsed = reminder(value)?;
        result.push_str(&format!(" @remind({})", parsed.to_rfc3339()));
    }
    Ok(result)
}

pub fn rewrite(source: &str, start: usize, edit: TaskEdit) -> Result<String, String> {
    if parse_checklist_items(source).any(|item| {
        moved(item.text)
            && item.start <= start
            && block_end(source, item.end, item.checkbox - item.start - 3) > start
    }) {
        return Err("conflict: task was rolled over".into());
    }
    let item = parse_checklist_items(source)
        .find(|item| item.start == start)
        .ok_or_else(|| "conflict: task changed; refresh the inbox".to_string())?;
    let (title, schedule) = metadata(item.text);
    let mut next = source.to_string();
    match edit {
        TaskEdit::Schedule { schedule } => {
            // Replacing a schedule also replaces malformed or orphaned directives.
            let title = TOKEN.replace_all(item.text, "");
            next.replace_range(
                item.checkbox + 3..item.end,
                &format!("{}{}", title.trim(), suffix(&schedule)?),
            );
        }
        TaskEdit::Complete { checked } => {
            if checked && !item.checked {
                if let Schedule::Dated {
                    due,
                    recurrence: Some(recurrence),
                    reminder,
                } = schedule
                {
                    let due_date = date(&due)?;
                    let next_due = match recurrence {
                        Recurrence::Daily => due_date.checked_add_days(Days::new(1)),
                        Recurrence::Weekly => due_date.checked_add_days(Days::new(7)),
                        Recurrence::Monthly => due_date.checked_add_months(Months::new(1)),
                    }
                    .ok_or("task date is out of range")?;
                    let next_reminder = reminder
                        .as_deref()
                        .map(|value| {
                            self::reminder(value)?
                                .checked_add_signed(next_due - due_date)
                                .map(|value| value.to_rfc3339())
                                .ok_or_else(|| "task reminder is out of range".to_string())
                        })
                        .transpose()?;
                    let next_schedule = Schedule::Dated {
                        due: next_due.format("%Y-%m-%d").to_string(),
                        recurrence: Some(recurrence),
                        reminder: next_reminder,
                    };
                    let prefix = &source[item.start..item.checkbox - 3];
                    let newline = if source.contains("\r\n") {
                        "\r\n"
                    } else {
                        "\n"
                    };
                    // Keep the original task's children attached to that occurrence.
                    let insertion = block_end(source, item.end, prefix.len());
                    let separator = if next[..insertion].ends_with('\n') {
                        ""
                    } else {
                        newline
                    };
                    next.insert_str(
                        insertion,
                        &format!(
                            "{separator}{prefix}- [ ] {title}{}{newline}",
                            suffix(&next_schedule)?
                        ),
                    );
                    // Only the next occurrence recurs, so reopening history cannot duplicate it.
                    let completed = Schedule::Dated {
                        due,
                        recurrence: None,
                        reminder,
                    };
                    next.replace_range(
                        item.checkbox + 3..item.end,
                        &format!("{title}{}", suffix(&completed)?),
                    );
                }
            }
            next.replace_range(
                item.checkbox..item.checkbox + 1,
                if checked { "x" } else { " " },
            );
        }
    }
    Ok(next)
}

pub fn moved(text: &str) -> bool {
    text.contains("***Moved to*** [[") || text.contains("***Moved to [[")
}

pub fn block_end(source: &str, end: usize, parent_indent: usize) -> usize {
    let mut offset = end;
    for segment in source[end..].split_inclusive('\n') {
        let line = segment.trim_end_matches(['\r', '\n']);
        let indent = line.len() - line.trim_start_matches([' ', '\t']).len();
        if !line.trim().is_empty() && indent <= parent_indent {
            break;
        }
        offset += segment.len();
    }
    offset
}
