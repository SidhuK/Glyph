use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex};
use std::time::Duration;
use tracing::{debug, warn};

#[derive(Clone, Debug)]
pub struct CodexNotification {
    pub seq: u64,
    pub method: String,
    pub params: Value,
}

enum RpcReply {
    Result(Value),
    Error(String),
    ProcessExited,
}

#[derive(Debug)]
enum CodexError {
    Transport(String),
    Message(String),
}

impl CodexError {
    fn is_transport(&self) -> bool {
        matches!(self, Self::Transport(_))
    }

    fn into_message(self) -> String {
        match self {
            Self::Transport(message) | Self::Message(message) => message,
        }
    }
}

struct RuntimeProcess {
    child: Mutex<Child>,
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<RpcReply>>>>,
    notifications: Arc<(Mutex<NotificationQueue>, Condvar)>,
    initialized: AtomicBool,
    initialization: Mutex<()>,
}

struct NotificationQueue {
    items: VecDeque<CodexNotification>,
}

impl NotificationQueue {
    fn new() -> Self {
        Self {
            items: VecDeque::new(),
        }
    }

    fn push(&mut self, seq: u64, method: String, params: Value) -> u64 {
        self.items.push_back(CodexNotification {
            seq,
            method,
            params,
        });
        while self.items.len() > 4000 {
            let _ = self.items.pop_front();
        }
        seq
    }

    fn newest_seq(&self) -> u64 {
        self.items.back().map(|n| n.seq).unwrap_or(0)
    }

    fn first_after(&self, after_seq: u64) -> Option<CodexNotification> {
        self.items.iter().find(|n| n.seq > after_seq).cloned()
    }
}

pub struct CodexState {
    process: Mutex<Option<Arc<RuntimeProcess>>>,
    next_id: AtomicU64,
    next_notification_seq: Arc<AtomicU64>,
}

impl Default for CodexState {
    fn default() -> Self {
        Self {
            process: Mutex::new(None),
            next_id: AtomicU64::new(1),
            next_notification_seq: Arc::new(AtomicU64::new(1)),
        }
    }
}

impl CodexState {
    fn candidate_codex_paths() -> Vec<PathBuf> {
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Some(explicit) = std::env::var_os("CODEX_CLI_PATH") {
            candidates.push(PathBuf::from(explicit));
        }
        if let Some(path_var) = std::env::var_os("PATH") {
            for dir in std::env::split_paths(&path_var) {
                candidates.push(dir.join("codex"));
            }
        }
        if let Some(home) = std::env::var_os("HOME") {
            let home = PathBuf::from(home);
            candidates.push(home.join(".bun/bin/codex"));
            candidates.push(home.join(".npm-global/bin/codex"));
            candidates.push(home.join(".local/bin/codex"));
        }
        candidates.push(PathBuf::from("/opt/homebrew/bin/codex"));
        candidates.push(PathBuf::from("/usr/local/bin/codex"));
        candidates.push(PathBuf::from("/usr/bin/codex"));
        candidates
    }

    fn is_executable(path: &Path) -> bool {
        if !path.is_file() {
            return false;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = std::fs::metadata(path) {
                let mode = meta.permissions().mode();
                return mode & 0o111 != 0;
            }
            false
        }
        #[cfg(not(unix))]
        {
            true
        }
    }

    fn resolve_codex_binary() -> Result<PathBuf, String> {
        let mut searched: Vec<String> = Vec::new();
        for candidate in Self::candidate_codex_paths() {
            searched.push(candidate.display().to_string());
            if Self::is_executable(&candidate) {
                return Ok(candidate);
            }
        }
        Err(format!(
            "failed to locate codex CLI binary. Set CODEX_CLI_PATH to the full executable path. searched: {}",
            searched.join(", ")
        ))
    }

    fn spawn_process(&self) -> Result<RuntimeProcess, String> {
        let codex_bin = Self::resolve_codex_binary()?;
        let mut child = Command::new(&codex_bin)
            .args(["app-server", "--listen", "stdio://"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                format!(
                    "failed to start codex app-server using {}: {}",
                    codex_bin.display(),
                    e
                )
            })?;

        let stdin = match child.stdin.take() {
            Some(stdin) => stdin,
            None => {
                Self::stop_child(&mut child);
                return Err("failed to capture codex stdin".to_string());
            }
        };
        let stdout = match child.stdout.take() {
            Some(stdout) => stdout,
            None => {
                Self::stop_child(&mut child);
                return Err("failed to capture codex stdout".to_string());
            }
        };
        let stderr = match child.stderr.take() {
            Some(stderr) => stderr,
            None => {
                Self::stop_child(&mut child);
                return Err("failed to capture codex stderr".to_string());
            }
        };

        let pending = Arc::new(Mutex::new(HashMap::new()));
        let notifications = Arc::new((Mutex::new(NotificationQueue::new()), Condvar::new()));
        let pending_for_reader = Arc::clone(&pending);
        let notifications_for_reader = Arc::clone(&notifications);
        let next_notification_seq = Arc::clone(&self.next_notification_seq);
        std::thread::spawn(move || {
            read_stdout_loop(
                stdout,
                pending_for_reader,
                notifications_for_reader,
                next_notification_seq,
            )
        });
        std::thread::spawn(move || read_stderr_loop(stderr));

        Ok(RuntimeProcess {
            child: Mutex::new(child),
            stdin: Arc::new(Mutex::new(stdin)),
            pending,
            notifications,
            initialized: AtomicBool::new(false),
            initialization: Mutex::new(()),
        })
    }

    fn write_line(process: &RuntimeProcess, value: &Value) -> Result<(), CodexError> {
        let mut line =
            serde_json::to_vec(value).map_err(|error| CodexError::Message(error.to_string()))?;
        line.push(b'\n');
        let mut guard = process
            .stdin
            .lock()
            .map_err(|_| CodexError::Message("codex stdin lock poisoned".to_string()))?;
        guard
            .write_all(&line)
            .and_then(|_| guard.flush())
            .map_err(|error| {
                CodexError::Transport(format!("failed writing to codex app-server: {error}"))
            })
    }

    fn child_exit_message(process: &RuntimeProcess) -> Option<String> {
        let mut child = match process.child.lock() {
            Ok(child) => child,
            Err(_) => return Some("codex child lock poisoned".to_string()),
        };
        match child.try_wait() {
            Ok(Some(status)) => Some(format!("codex app-server exited with {status}")),
            Ok(None) => None,
            Err(error) => Some(format!("failed checking codex app-server: {error}")),
        }
    }

    fn stop_child(child: &mut Child) {
        let _ = child.kill();
        let _ = child.wait();
    }

    fn stop_process(process: Arc<RuntimeProcess>) {
        if let Ok(mut child) = process.child.lock() {
            Self::stop_child(&mut child);
        }
    }

    fn discard_process(guard: &mut Option<Arc<RuntimeProcess>>) {
        if let Some(stale) = guard.take() {
            Self::stop_process(stale);
        }
    }

    fn ensure_process_locked(
        &self,
        guard: &mut Option<Arc<RuntimeProcess>>,
    ) -> Result<Arc<RuntimeProcess>, String> {
        if guard.is_none() {
            *guard = Some(Arc::new(self.spawn_process()?));
        }
        guard
            .as_ref()
            .map(Arc::clone)
            .ok_or_else(|| "codex runtime unavailable".to_string())
    }

    fn discard_if_current(&self, process: &Arc<RuntimeProcess>) -> Result<(), String> {
        let mut guard = self
            .process
            .lock()
            .map_err(|_| "codex process lock poisoned".to_string())?;
        if guard
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, process))
        {
            Self::discard_process(&mut guard);
        }
        Ok(())
    }

    fn ensure_initialized(&self, process: &RuntimeProcess) -> Result<(), CodexError> {
        if process.initialized.load(Ordering::Acquire) {
            return Ok(());
        }
        let _initialization = process
            .initialization
            .lock()
            .map_err(|_| CodexError::Message("codex initialization lock poisoned".to_string()))?;
        if process.initialized.load(Ordering::Acquire) {
            return Ok(());
        }

        let init_params = json!({
            "clientInfo": {
                "name": "Glyph",
                "title": "Glyph",
                "version": "0.1.0"
            }
        });
        let _ = self.call_process(process, "initialize", init_params, Duration::from_secs(20))?;
        Self::write_line(
            process,
            &json!({
                "method": "initialized",
                "params": {}
            }),
        )?;
        process.initialized.store(true, Ordering::Release);
        Ok(())
    }

    fn call_process(
        &self,
        process: &RuntimeProcess,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, CodexError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel::<RpcReply>();
        {
            let mut pending = process
                .pending
                .lock()
                .map_err(|_| CodexError::Message("pending map lock poisoned".to_string()))?;
            pending.insert(id, tx);
        }

        let msg = json!({
            "id": id,
            "method": method,
            "params": params,
        });
        if let Err(error) = Self::write_line(process, &msg) {
            if let Ok(mut pending) = process.pending.lock() {
                pending.remove(&id);
            }
            return Err(error);
        }

        match rx.recv_timeout(timeout) {
            Ok(RpcReply::Result(v)) => Ok(v),
            Ok(RpcReply::Error(error)) => Err(CodexError::Message(error)),
            Ok(RpcReply::ProcessExited) => Err(CodexError::Transport(
                "codex app-server process exited".to_string(),
            )),
            Err(_) => {
                let mut pending = process
                    .pending
                    .lock()
                    .map_err(|_| CodexError::Message("pending map lock poisoned".to_string()))?;
                pending.remove(&id);
                Err(CodexError::Message(format!(
                    "codex request timed out: {method}"
                )))
            }
        }
    }

    pub fn call(&self, method: &str, params: Value, timeout: Duration) -> Result<Value, String> {
        let mut process = {
            let mut guard = self
                .process
                .lock()
                .map_err(|_| "codex process lock poisoned".to_string())?;
            let exited = guard
                .as_ref()
                .and_then(|process| Self::child_exit_message(process))
                .map(|error| {
                    debug!("{error}; restarting codex app-server");
                })
                .is_some();
            if exited {
                Self::discard_process(&mut guard);
            }
            self.ensure_process_locked(&mut guard)?
        };

        let initialized = self.ensure_initialized(&process);
        if let Err(error) = initialized {
            if !error.is_transport() {
                return Err(error.into_message());
            }

            debug!("{error:?}; restarting codex app-server");
            self.discard_if_current(&process)?;
            let replacement = {
                let mut guard = self
                    .process
                    .lock()
                    .map_err(|_| "codex process lock poisoned".to_string())?;
                self.ensure_process_locked(&mut guard)?
            };
            if let Err(error) = self.ensure_initialized(&replacement) {
                let transport_failure = error.is_transport();
                let message = error.into_message();
                if transport_failure {
                    let _ = self.discard_if_current(&replacement);
                }
                return Err(message);
            }
            process = replacement;
        }

        let result = self.call_process(&process, method, params, timeout);
        if let Err(error) = &result {
            let child_exited = Self::child_exit_message(&process).is_some();
            if child_exited || error.is_transport() {
                let _ = self.discard_if_current(&process);
            }
        }
        result.map_err(CodexError::into_message)
    }

    pub fn latest_notification_seq(&self) -> Result<u64, String> {
        let notifications = {
            let guard = self
                .process
                .lock()
                .map_err(|_| "codex process lock poisoned".to_string())?;
            guard
                .as_ref()
                .map(|process| Arc::clone(&process.notifications))
        };
        let Some(notifications) = notifications else {
            return Ok(0);
        };
        let (lock, _) = &*notifications;
        let queue = lock
            .lock()
            .map_err(|_| "codex notification lock poisoned".to_string())?;
        Ok(queue.newest_seq())
    }

    pub fn wait_notification_after(
        &self,
        after_seq: u64,
        timeout: Duration,
    ) -> Result<Option<CodexNotification>, String> {
        let notifications = {
            let guard = self
                .process
                .lock()
                .map_err(|_| "codex process lock poisoned".to_string())?;
            guard
                .as_ref()
                .map(|process| Arc::clone(&process.notifications))
        };
        let Some(notifications) = notifications else {
            return Ok(None);
        };
        let (lock, cv) = &*notifications;
        let mut queue = lock
            .lock()
            .map_err(|_| "codex notification lock poisoned".to_string())?;

        if let Some(n) = queue.first_after(after_seq) {
            return Ok(Some(n));
        }

        let (next, _) = cv
            .wait_timeout(queue, timeout)
            .map_err(|_| "codex notification condvar poisoned".to_string())?;
        queue = next;
        Ok(queue.first_after(after_seq))
    }
}

impl Drop for CodexState {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.process.lock() {
            Self::discard_process(&mut guard);
        }
    }
}

fn read_stdout_loop(
    stdout: ChildStdout,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<RpcReply>>>>,
    notifications: Arc<(Mutex<NotificationQueue>, Condvar)>,
    next_notification_seq: Arc<AtomicU64>,
) {
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        let line = match line {
            Ok(v) => v,
            Err(e) => {
                warn!("codex stdout read error: {e}");
                break;
            }
        };
        let parsed: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                warn!("codex stdout json parse error: {e}");
                continue;
            }
        };

        let id = parsed.get("id").and_then(|v| v.as_u64());
        if let Some(id) = id {
            let tx = {
                let mut map = match pending.lock() {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                map.remove(&id)
            };
            if let Some(tx) = tx {
                if let Some(result) = parsed.get("result") {
                    let _ = tx.send(RpcReply::Result(result.clone()));
                } else if let Some(err) = parsed.get("error") {
                    let msg = err
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("codex rpc error")
                        .to_string();
                    let _ = tx.send(RpcReply::Error(msg));
                } else {
                    let _ = tx.send(RpcReply::Error("codex rpc malformed response".to_string()));
                }
            }
            continue;
        }

        if let Some(method) = parsed.get("method").and_then(|v| v.as_str()) {
            let params = parsed.get("params").cloned().unwrap_or_else(|| json!({}));
            let (lock, cv) = &*notifications;
            if let Ok(mut q) = lock.lock() {
                let seq = next_notification_seq.fetch_add(1, Ordering::Relaxed);
                let seq = q.push(seq, method.to_string(), params);
                debug!("codex notification seq={seq} method={method}");
                cv.notify_all();
            }
        }
    }

    if let Ok(mut map) = pending.lock() {
        for (_, tx) in map.drain() {
            let _ = tx.send(RpcReply::ProcessExited);
        }
    }

    let (lock, cv) = &*notifications;
    if let Ok(mut q) = lock.lock() {
        let seq = next_notification_seq.fetch_add(1, Ordering::Relaxed);
        let _ = q.push(seq, "codex/process/exited".to_string(), json!({}));
        cv.notify_all();
    }
}

fn read_stderr_loop(stderr: ChildStderr) {
    let reader = BufReader::new(stderr);
    for line in reader.lines() {
        match line {
            Ok(v) => debug!("codex stderr: {v}"),
            Err(e) => {
                warn!("codex stderr read error: {e}");
                break;
            }
        }
    }
}
