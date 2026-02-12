use std::{collections::HashMap, sync::Mutex};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct AiState {
    cancels: Mutex<HashMap<String, CancellationToken>>,
}

impl AiState {
    pub fn register(&self, job_id: &str) -> CancellationToken {
        let token = CancellationToken::new();
        let mut map = self.cancels.lock().unwrap_or_else(|p| p.into_inner());
        map.insert(job_id.to_string(), token.clone());
        token
    }

    pub fn cancel(&self, job_id: &str) {
        let map = self.cancels.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(token) = map.get(job_id) {
            token.cancel();
        }
    }

    pub fn finish(&self, job_id: &str) {
        let mut map = self.cancels.lock().unwrap_or_else(|p| p.into_inner());
        map.remove(job_id);
    }
}
