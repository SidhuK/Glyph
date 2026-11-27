use std::collections::BTreeMap;

use super::api::TaskEdit;
use super::details::description_fields;
use super::fields::priority_name;
use super::lines::markdown_lines;
use super::parse::{block_items, checklist_items_in, parse_checklist_items};
use super::splice::{apply_splices, removal_range, trimmed, Splice};
use super::types::{ParsedChecklistItem, TaskFieldKey, TaskStatusKind};

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct TaskConflict;

#[derive(Clone, Debug, PartialEq)]
enum FieldChange {
    Set(String),
    Ensure(String),
    Remove,
}

type FieldPlan = BTreeMap<TaskFieldKey, FieldChange>;

pub(crate) fn apply_task_edits(
    markdown: &str,
    edits: &[&TaskEdit],
    today: &str,
) -> Result<Option<String>, TaskConflict> {
    let items = parse_checklist_items(markdown);
    for edit in edits {
        let item = items
            .iter()
            .find(|item| item.start == edit.start)
            .ok_or(TaskConflict)?;
        if item.text != edit.text || item.moved {
            return Err(TaskConflict);
        }
    }
    let mut ordered = edits.to_vec();
    ordered.sort_by_key(|edit| std::cmp::Reverse(edit.start));
    let mut next = markdown.to_string();
    for edit in ordered {
        let splices = edit_splices(&next, edit, today).ok_or(TaskConflict)?;
        next = apply_splices(&next, splices);
    }
    Ok((next != markdown).then_some(next))
}

fn edit_splices(markdown: &str, edit: &TaskEdit, today: &str) -> Option<Vec<Splice>> {
    let lines = markdown_lines(markdown);
    let items = checklist_items_in(&lines);
    let index = items.iter().position(|item| item.start == edit.start)?;
    let item = &items[index];
    let mut splices = Vec::new();
    let mut plan = FieldPlan::new();
    if let Some(status) = edit.set_status.as_deref() {
        let kind = TaskStatusKind::from_status(status.chars().next()?);
        splices.push(Splice::replace(item.status_range(), status));
        plan_status(&mut plan, kind, today);
        if kind == TaskStatusKind::Done && !edit.skip_subtasks {
            for child in &block_items(&lines, &items, index)[1..] {
                if child.is_open() && !child.moved {
                    splices.push(Splice::replace(child.status_range(), "x"));
                    let child_plan = FieldPlan::from([(
                        TaskFieldKey::Completion,
                        FieldChange::Ensure(today.to_string()),
                    )]);
                    splices.extend(field_splices(markdown, child, &child_plan));
                }
            }
        }
    }
    if let Some(fields) = &edit.set_fields {
        if let Some(due) = &fields.due {
            plan.insert(TaskFieldKey::Due, change(due.clone()));
        }
        if let Some(priority) = fields.priority {
            let name = priority.and_then(priority_name).map(str::to_string);
            plan.insert(TaskFieldKey::Priority, change(name));
        }
        if let Some(completion) = &fields.completion {
            plan.insert(TaskFieldKey::Completion, change(completion.clone()));
        }
        if let Some(cancelled) = &fields.cancelled {
            plan.insert(TaskFieldKey::Cancelled, change(cancelled.clone()));
        }
    }
    if let Some(title) = edit.set_title.as_deref() {
        splices.extend(title_splices(markdown, item, title.trim()));
    }
    splices.extend(field_splices(markdown, item, &plan));
    Some(splices)
}

fn change(value: Option<String>) -> FieldChange {
    value.map_or(FieldChange::Remove, FieldChange::Set)
}

fn plan_status(plan: &mut FieldPlan, kind: TaskStatusKind, today: &str) {
    let (completion, cancelled) = match kind {
        TaskStatusKind::Done => (FieldChange::Ensure(today.to_string()), FieldChange::Remove),
        TaskStatusKind::Cancelled => (FieldChange::Remove, FieldChange::Ensure(today.to_string())),
        TaskStatusKind::Todo | TaskStatusKind::InProgress => {
            (FieldChange::Remove, FieldChange::Remove)
        }
    };
    plan.insert(TaskFieldKey::Completion, completion);
    plan.insert(TaskFieldKey::Cancelled, cancelled);
}

fn bracket(key: TaskFieldKey, value: &str) -> String {
    format!("[{}:: {value}]", key.as_str())
}

fn append_position(markdown: &str, item: &ParsedChecklistItem) -> usize {
    trimmed(markdown, item.description())
        .end
        .max(item.body_start)
}

fn field_splices(markdown: &str, item: &ParsedChecklistItem, plan: &FieldPlan) -> Vec<Splice> {
    let fields = description_fields(markdown, item);
    let mut splices = Vec::new();
    let mut appended = String::new();
    for (key, change) in plan {
        let mut matching = fields
            .iter()
            .filter(|field| field.known_key() == Some(*key));
        let first = matching.next();
        let remove = |range: std::ops::Range<usize>| {
            Splice::replace(removal_range(markdown, range, item.description()), "")
        };
        match (change, first) {
            (FieldChange::Remove, Some(field)) => {
                splices.push(remove(field.range.clone()));
                splices.extend(matching.map(|field| remove(field.range.clone())));
            }
            (FieldChange::Set(value), Some(field)) => {
                splices.push(Splice::replace(field.range.clone(), bracket(*key, value)));
                splices.extend(matching.map(|field| remove(field.range.clone())));
            }
            (FieldChange::Set(value) | FieldChange::Ensure(value), None) => {
                appended.push_str("  ");
                appended.push_str(&bracket(*key, value));
            }
            (FieldChange::Ensure(_), Some(_)) | (FieldChange::Remove, None) => {}
        }
    }
    if !appended.is_empty() {
        splices.push(Splice::insert(append_position(markdown, item), appended));
    }
    splices
}

fn title_splices(markdown: &str, item: &ParsedChecklistItem, title: &str) -> Vec<Splice> {
    let description = item.description();
    let fields = description_fields(markdown, item);
    let mut gaps = Vec::with_capacity(fields.len() + 1);
    let mut cursor = description.start;
    for field in &fields {
        gaps.push(cursor..field.range.start);
        cursor = field.range.end;
    }
    gaps.push(cursor..description.end);
    let mut cores = gaps
        .into_iter()
        .map(|gap| trimmed(markdown, gap))
        .filter(|core| !core.is_empty());
    let Some(first) = cores.next() else {
        let lead = if item.separated { "" } else { " " };
        let trail = if fields.is_empty() { "" } else { "  " };
        return vec![Splice::insert(
            description.start,
            format!("{lead}{title}{trail}"),
        )];
    };
    let mut splices = vec![Splice::replace(first, title)];
    splices.extend(
        cores.map(|core| Splice::replace(removal_range(markdown, core, description.clone()), "")),
    );
    splices
}
