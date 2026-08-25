use objc2_app_kit::{NSAlert, NSAlertFirstButtonReturn, NSTextField};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize, NSString};

use super::types::GitSyncCommitMessagePromptRequest;

pub fn prompt_commit_message(
    request: GitSyncCommitMessagePromptRequest,
) -> Result<Option<String>, String> {
    let Some(mtm) = MainThreadMarker::new() else {
        return Err("commit message prompt must run on the macOS main thread".to_string());
    };

    let alert = NSAlert::new(mtm);
    let title = NSString::from_str(&request.title);
    let description = NSString::from_str(&request.description);
    let placeholder = NSString::from_str(&request.placeholder);
    let confirm_label = NSString::from_str(&request.confirm_label);
    let cancel_label = NSString::from_str(&request.cancel_label);

    alert.setMessageText(&title);
    alert.setInformativeText(&description);

    let input = NSTextField::initWithFrame(
        mtm.alloc(),
        NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(360.0, 24.0)),
    );
    input.setPlaceholderString(Some(&placeholder));
    input.setStringValue(&NSString::from_str(""));
    alert.setAccessoryView(Some(&input));
    alert.addButtonWithTitle(&confirm_label);
    alert.addButtonWithTitle(&cancel_label);
    alert.layout();
    let _ = alert.window().makeFirstResponder(Some(&input));

    if alert.runModal() != NSAlertFirstButtonReturn {
        return Ok(None);
    }

    Ok(Some(input.stringValue().to_string()))
}
