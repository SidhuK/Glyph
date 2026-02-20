use serde_json::Value;
use std::time::Duration;

use super::state::{CodexNotification, CodexState};

pub fn rpc_call(
    state: &CodexState,
    method: &str,
    params: Value,
    timeout: Duration,
) -> Result<Value, String> {
    state.call(method, params, timeout)
}

pub fn latest_seq(state: &CodexState) -> Result<u64, String> {
    state.latest_notification_seq()
}

pub fn wait_notification_after(
    state: &CodexState,
    after_seq: u64,
    timeout: Duration,
) -> Result<Option<CodexNotification>, String> {
    state.wait_notification_after(after_seq, timeout)
}
