use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
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
}

struct RuntimeProcess {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    initialized: bool,
}

struct NotificationQueue {
    next_seq: u64,
    items: VecDeque<CodexNotification>,
}

impl NotificationQueue {
    fn new() -> Self {
        Self {
            next_seq: 1,
            items: VecDeque::new(),
        }
    }

    fn push(&mut self, method: String, params: Value) -> u64 {
        let seq = self.next_seq;
        self.next_seq = self.next_seq.saturating_add(1);
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
    process: Mutex<Option<RuntimeProcess>>,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<RpcReply>>>>,
    notifications: Arc<(Mutex<NotificationQueue>, Condvar)>,
    next_id: AtomicU64,
}

impl Default for CodexState {
    fn default() -> Self {
        Self {
            process: Mutex::new(None),
            pending: Arc::new(Mutex::new(HashMap::new())),
            notifications: Arc::new((Mutex::new(NotificationQueue::new()), Condvar::new())),
            next_id: AtomicU64::new(1),
        }
    }
}

impl CodexState {
    fn spawn_process(&self) -> Result<RuntimeProcess, String> {
        let mut child = Command::new("codex")
            .args(["app-server"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to start codex app-server: {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "failed to capture codex stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "failed to capture codex stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "failed to capture codex stderr".to_string())?;

        let pending = Arc::clone(&self.pending);
        let notifications = Arc::clone(&self.notifications);
        std::thread::spawn(move || read_stdout_loop(stdout, pending, notifications));
        std::thread::spawn(move || read_stderr_loop(stderr));

        Ok(RuntimeProcess {
            child,
            stdin: Arc::new(Mutex::new(stdin)),
            initialized: false,
        })
    }

    fn write_line(process: &RuntimeProcess, value: &Value) -> Result<(), String> {
        let mut line = serde_json::to_vec(value).map_err(|e| e.to_string())?;
        line.push(b'\n');
        let mut guard = process
            .stdin
            .lock()
            .map_err(|_| "codex stdin lock poisoned".to_string())?;
        guard
            .write_all(&line)
            .and_then(|_| guard.flush())
            .map_err(|e| format!("failed writing to codex app-server: {e}"))
    }

    fn ensure_process_locked<'a>(
        &'a self,
        guard: &'a mut Option<RuntimeProcess>,
    ) -> Result<&'a mut RuntimeProcess, String> {
        if guard.is_none() {
            *guard = Some(self.spawn_process()?);
        }
        guard
            .as_mut()
            .ok_or_else(|| "codex runtime unavailable".to_string())
    }

    fn ensure_initialized_locked(&self, process: &mut RuntimeProcess) -> Result<(), String> {
        if process.initialized {
            return Ok(());
        }

        let init_params = json!({
            "protocolVersion": "1",
            "clientInfo": {
                "name": "Glyph",
                "version": "0.1.0"
            }
        });
        let _ = self.call_locked(process, "initialize", init_params, Duration::from_secs(20))?;
        Self::write_line(
            process,
            &json!({
                "jsonrpc": "2.0",
                "method": "initialized",
                "params": {}
            }),
        )?;
        process.initialized = true;
        Ok(())
    }

    fn call_locked(
        &self,
        process: &mut RuntimeProcess,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel::<RpcReply>();
        {
            let mut pending = self
                .pending
                .lock()
                .map_err(|_| "pending map lock poisoned".to_string())?;
            pending.insert(id, tx);
        }

        let msg = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        if let Err(e) = Self::write_line(process, &msg) {
            let mut pending = self
                .pending
                .lock()
                .map_err(|_| "pending map lock poisoned".to_string())?;
            pending.remove(&id);
            return Err(e);
        }

        match rx.recv_timeout(timeout) {
            Ok(RpcReply::Result(v)) => Ok(v),
            Ok(RpcReply::Error(e)) => Err(e),
            Err(_) => {
                let mut pending = self
                    .pending
                    .lock()
                    .map_err(|_| "pending map lock poisoned".to_string())?;
                pending.remove(&id);
                Err(format!("codex request timed out: {method}"))
            }
        }
    }

    pub fn call(&self, method: &str, params: Value, timeout: Duration) -> Result<Value, String> {
        let mut guard = self
            .process
            .lock()
            .map_err(|_| "codex process lock poisoned".to_string())?;
        let process = self.ensure_process_locked(&mut guard)?;
        self.ensure_initialized_locked(process)?;
        self.call_locked(process, method, params, timeout)
    }

    pub fn latest_notification_seq(&self) -> Result<u64, String> {
        let (lock, _) = &*self.notifications;
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
        let (lock, cv) = &*self.notifications;
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
            if let Some(mut process) = guard.take() {
                let _ = process.child.kill();
                let _ = process.child.wait();
            }
        }
    }
}

fn read_stdout_loop(
    stdout: ChildStdout,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<RpcReply>>>>,
    notifications: Arc<(Mutex<NotificationQueue>, Condvar)>,
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
                let seq = q.push(method.to_string(), params);
                debug!("codex notification seq={seq} method={method}");
                cv.notify_all();
            }
        }
    }

    let (lock, cv) = &*notifications;
    if let Ok(mut q) = lock.lock() {
        let _ = q.push("codex/process/exited".to_string(), json!({}));
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
