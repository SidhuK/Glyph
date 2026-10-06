use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct NativeTextPromptRequest {
    pub title: String,
    pub description: String,
    pub initial_value: String,
    pub confirm_label: String,
    pub cancel_label: String,
}

#[cfg(target_os = "macos")]
fn prompt_text(request: NativeTextPromptRequest) -> Result<Option<String>, String> {
    use objc2_app_kit::{NSAlert, NSAlertFirstButtonReturn, NSTextField};
    use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize, NSString};

    let Some(mtm) = MainThreadMarker::new() else {
        return Err("text prompt must run on the macOS main thread".to_string());
    };

    let alert = NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(&request.title));
    alert.setInformativeText(&NSString::from_str(&request.description));

    let input = NSTextField::initWithFrame(
        mtm.alloc(),
        NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(360.0, 24.0)),
    );
    input.setStringValue(&NSString::from_str(&request.initial_value));
    alert.setAccessoryView(Some(&input));
    alert.addButtonWithTitle(&NSString::from_str(&request.confirm_label));
    alert.addButtonWithTitle(&NSString::from_str(&request.cancel_label));
    alert.layout();
    let _ = alert.window().makeFirstResponder(Some(&input));

    if alert.runModal() != NSAlertFirstButtonReturn {
        return Ok(None);
    }
    Ok(Some(input.stringValue().to_string()))
}

#[tauri::command]
pub async fn native_text_prompt(
    app: AppHandle,
    request: NativeTextPromptRequest,
) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        app.run_on_main_thread(move || {
            let _ = sender.send(prompt_text(request));
        })
        .map_err(|error| format!("failed to open text prompt: {error}"))?;

        tauri::async_runtime::spawn_blocking(move || {
            receiver
                .recv()
                .map_err(|error| format!("text prompt failed: {error}"))?
        })
        .await
        .map_err(|error| format!("text prompt failed: {error}"))?
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, request);
        Err("text prompts are only available on macOS".to_string())
    }
}
