use super::api::{TaskCreateRequest, TaskEdit, TaskUpdateBatchRequest};
use super::fields::{is_valid_date, priority_name};

fn check_date(value: &str, label: &str) -> Result<(), String> {
    if is_valid_date(value) {
        Ok(())
    } else {
        Err(format!("invalid {label} date: {value}"))
    }
}

fn check_priority(priority: u8) -> Result<(), String> {
    priority_name(priority)
        .map(|_| ())
        .ok_or_else(|| format!("invalid task priority: {priority}"))
}

fn check_title(title: &str) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("task title cannot be empty".to_string());
    }
    if title.contains(['\n', '\r']) {
        return Err("task title must be a single line".to_string());
    }
    Ok(())
}

fn check_status(status: &str) -> Result<(), String> {
    let mut chars = status.chars();
    match (chars.next(), chars.next()) {
        (Some(ch), None) if !matches!(ch, ']' | '\n' | '\r') => Ok(()),
        _ => Err(format!("invalid task status: {status:?}")),
    }
}

fn validate_edit(edit: &TaskEdit) -> Result<(), String> {
    if let Some(status) = edit.set_status.as_deref() {
        check_status(status)?;
    }
    if let Some(fields) = &edit.set_fields {
        if let Some(Some(due)) = &fields.due {
            check_date(due, "due")?;
        }
        if let Some(Some(priority)) = fields.priority {
            check_priority(priority)?;
        }
        if let Some(Some(completion)) = &fields.completion {
            check_date(completion, "completion")?;
        }
        if let Some(Some(cancelled)) = &fields.cancelled {
            check_date(cancelled, "cancelled")?;
        }
    }
    if let Some(title) = edit.set_title.as_deref() {
        check_title(title)?;
    }
    Ok(())
}

pub(super) fn validate_edits(request: &TaskUpdateBatchRequest) -> Result<(), String> {
    check_date(&request.today, "today")?;
    request.edits.iter().try_for_each(validate_edit)
}

pub(super) fn validate_create(request: &TaskCreateRequest) -> Result<(), String> {
    check_title(&request.title)?;
    if let Some(due) = request.due.as_deref() {
        check_date(due, "due")?;
    }
    if let Some(priority) = request.priority {
        check_priority(priority)?;
    }
    Ok(())
}
