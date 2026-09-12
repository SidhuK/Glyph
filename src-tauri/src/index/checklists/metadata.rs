use chrono::{Datelike, Days, Months, NaiveDate};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskRepeat {
    Daily,
    Weekdays,
    Weekly,
    Monthly,
}

impl TaskRepeat {
    pub fn label(self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Weekdays => "weekdays",
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
        }
    }
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "daily" => Some(Self::Daily),
            "weekdays" => Some(Self::Weekdays),
            "weekly" => Some(Self::Weekly),
            "monthly" => Some(Self::Monthly),
            _ => None,
        }
    }
    pub fn next(self, date: NaiveDate) -> Option<NaiveDate> {
        match self {
            Self::Monthly => date.checked_add_months(Months::new(1)),
            Self::Weekly => date.checked_add_days(Days::new(7)),
            Self::Daily => date.checked_add_days(Days::new(1)),
            Self::Weekdays => {
                let mut next = date.checked_add_days(Days::new(1))?;
                while next.weekday().number_from_monday() > 5 {
                    next = next.checked_add_days(Days::new(1))?;
                }
                Some(next)
            }
        }
    }
}

pub fn date(value: &str) -> Option<NaiveDate> {
    if value.len() != 10 {
        return None;
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .filter(|d| d.format("%Y-%m-%d").to_string() == value)
}

// Only recognize valid trailing metadata; ordinary task text remains untouched.
pub fn split_metadata(text: &str) -> (String, Option<String>, Option<TaskRepeat>) {
    let mut body = text.trim_end();
    let mut due = None;
    let mut repeat = None;
    loop {
        if let Some((prefix, value)) = body.rsplit_once(" 🔁 ") {
            if repeat.is_none() {
                if let Some(parsed) = TaskRepeat::parse(value) {
                    repeat = Some(parsed);
                    body = prefix;
                    continue;
                }
            }
        }
        if let Some((prefix, value)) = body.rsplit_once(" 📅 ") {
            if due.is_none() && date(value).is_some() {
                due = Some(value.to_string());
                body = prefix;
                continue;
            }
        }
        break;
    }
    (body.to_string(), due, repeat)
}

pub fn with_metadata(text: &str, due: Option<&str>, repeat: Option<TaskRepeat>) -> String {
    let mut result = text.to_string();
    if let Some(due) = due {
        result.push_str(&format!(" 📅 {due}"));
    }
    if let Some(repeat) = repeat {
        result.push_str(&format!(" 🔁 {}", repeat.label()));
    }
    result
}
