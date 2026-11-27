use super::super::details::{task_details, TaskDetails};
use super::super::fields::{is_valid_date, scan_fields};
use super::super::parse::parse_checklist_items;
use super::super::types::TaskFieldKey;

fn details(line: &str) -> TaskDetails {
    let items = parse_checklist_items(line);
    task_details(line, &items[0])
}

fn keys(text: &str) -> Vec<(String, String)> {
    scan_fields(text)
        .into_iter()
        .map(|field| (field.key, field.value))
        .collect()
}

#[test]
fn reads_fields_anywhere_with_byte_ranges() {
    let text = "[due:: 2026-12-04] Send deck [priority:: High] to Dana  [Custom-Key_1::  x y ]";
    let fields = scan_fields(text);
    assert_eq!(fields.len(), 3);
    assert_eq!(&text[fields[0].range.clone()], "[due:: 2026-12-04]");
    assert_eq!(&text[fields[1].range.clone()], "[priority:: High]");
    assert_eq!(fields[2].key, "custom-key_1");
    assert_eq!(fields[2].value, "x y");
}

#[test]
fn ignores_fields_in_code_links_and_lookalikes() {
    let text = "`[due:: 2026-01-01]` ``a [due:: 2026-01-02] b`` [[Note [due:: x]]] [label](https://x.test/[due:: y]) [due:: 2026-01-03](url) word[due:: 2026-01-04] \\[due:: 2026-01-05] [1due:: x] [due: x]";
    assert!(keys(text).is_empty());
}

#[test]
fn values_may_hold_wikilinks_but_not_other_brackets() {
    assert_eq!(
        keys("[project:: [[Website]]] [bad:: a [b] c]"),
        vec![("project".to_string(), "[[Website]]".to_string())]
    );
    assert_eq!(
        keys("[due::2026-01-01]"),
        vec![("due".to_string(), "2026-01-01".to_string())]
    );
}

#[test]
fn validates_dates_against_the_month() {
    assert!(is_valid_date("2024-02-29"));
    assert!(!is_valid_date("2026-02-29"));
    assert!(!is_valid_date("2026-04-31"));
    assert!(!is_valid_date("2026-13-01"));
    assert!(!is_valid_date("2026-1-01"));
    assert!(!is_valid_date("+026-01-01"));
}

#[test]
fn parses_v1_fields_and_reports_invalid_values() {
    let parsed = details("- [ ] File taxes #Finance [priority:: highest] [due:: 2027-04-15]\n");
    assert_eq!(parsed.title, "File taxes #Finance");
    assert_eq!(parsed.priority, Some(4));
    assert_eq!(parsed.due.as_deref(), Some("2027-04-15"));
    assert_eq!(parsed.tags, vec!["finance"]);
    assert!(parsed.invalid.is_empty());

    let invalid = details(
        "- [x] Bad [due:: 2026-02-30] [priority:: urgent] [completion:: soon] [cancelled:: ]\n",
    );
    assert_eq!(
        (invalid.due, invalid.priority, invalid.completion),
        (None, None, None)
    );
    assert_eq!(
        invalid.invalid,
        vec![
            TaskFieldKey::Priority,
            TaskFieldKey::Due,
            TaskFieldKey::Completion,
            TaskFieldKey::Cancelled
        ]
    );
    assert_eq!(invalid.title, "Bad");
}

#[test]
fn first_occurrence_wins_and_unknown_fields_leave_the_title() {
    let parsed =
        details("- [ ] A [due:: 2026-01-02] B [due:: 2026-01-03] [scheduled:: 2026-01-01]\n");
    assert_eq!(parsed.due.as_deref(), Some("2026-01-02"));
    assert_eq!(parsed.title, "A B");
}

#[test]
fn reads_obsidian_emoji_aliases() {
    let parsed = details("- [x] Renew passport 📅 2026-11-20 ✅2026-11-19 ⏫\n");
    assert_eq!(parsed.due.as_deref(), Some("2026-11-20"));
    assert_eq!(parsed.completion.as_deref(), Some("2026-11-19"));
    assert_eq!(parsed.priority, Some(3));
    assert_eq!(parsed.title, "Renew passport");

    let selector =
        details("- [-] Old 🗓\u{FE0F} 2026-01-05 ❌ 2026-01-06 🔺\u{FE0F} 📆 2026-01-07\n");
    assert_eq!(selector.due.as_deref(), Some("2026-01-05"));
    assert_eq!(selector.cancelled.as_deref(), Some("2026-01-06"));
    assert_eq!(selector.priority, Some(4));
    assert_eq!(selector.title, "Old");

    let lonely = details("- [ ] Calendar 📅 sometime 🔽 ⏬\n");
    assert_eq!(lonely.due, None);
    assert_eq!(lonely.priority, Some(1));
    assert_eq!(lonely.title, "Calendar 📅 sometime");

    let bad_date = details("- [ ] x 📅 2026-02-31\n");
    assert_eq!(bad_date.invalid, vec![TaskFieldKey::Due]);
}

#[test]
fn tags_follow_inline_tag_rules() {
    let parsed = details("- [ ] Ship #work/Client #202406 `#code` [[Note#Heading]] #work/client [tag:: #hidden] #people/alice\n");
    assert_eq!(parsed.tags, vec!["work/client", "202406"]);
    assert_eq!(
        parsed.title,
        "Ship #work/Client #202406 `#code` [[Note#Heading]] #work/client #people/alice"
    );
}

#[test]
fn title_collapses_whitespace_and_drops_moved_markers() {
    let parsed =
        details("- [ ]   Call  [due:: 2026-01-01]   mom ***Moved from*** [[2026-01-01]]\n");
    assert_eq!(parsed.title, "Call mom");
}
