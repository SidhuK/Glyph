/// WKWebView on macOS hides continuous spellcheck underlines unless
/// `WebContinuousSpellCheckingEnabled` is set before any webview is created.
pub fn configure_continuous_spell_checking() {
    use objc2_foundation::{NSString, NSUserDefaults};

    let defaults = NSUserDefaults::standardUserDefaults();
    let key = NSString::from_str("WebContinuousSpellCheckingEnabled");
    defaults.setBool_forKey(true, &key);
    tracing::debug!("configured WebContinuousSpellCheckingEnabled for WKWebView");
}
