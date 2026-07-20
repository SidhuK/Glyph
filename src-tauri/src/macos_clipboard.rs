use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};

pub fn read_plain_text() -> Option<String> {
    let type_string = unsafe { NSPasteboardTypeString };
    NSPasteboard::generalPasteboard()
        .stringForType(type_string)
        .map(|value| value.to_string())
}
