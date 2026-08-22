use tokio::sync::{mpsc, oneshot};

use super::transport::{LspClient, ServerNotification};
use super::types::{LspClientConfig, LspClientError, ServerRequest};

#[derive(Clone)]
pub struct LspRequestHandle {
    tx: mpsc::Sender<RestartableOutgoing>,
    request_timeout_ms: u64,
}

impl LspRequestHandle {
    pub async fn send_request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, LspClientError> {
        let (response_tx, response_rx) = oneshot::channel();
        self.tx
            .send(RestartableOutgoing::Request {
                method: method.to_string(),
                params,
                response_tx,
            })
            .await
            .map_err(|_| LspClientError::ChannelClosed)?;

        tokio::time::timeout(
            std::time::Duration::from_millis(self.request_timeout_ms),
            response_rx,
        )
        .await
        .map_err(|_| LspClientError::RequestTimeout)?
        .map_err(|_| LspClientError::ChannelClosed)?
    }

    pub async fn send_notification(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<(), LspClientError> {
        self.tx
            .send(RestartableOutgoing::Notification {
                method: method.to_string(),
                params,
            })
            .await
            .map_err(|_| LspClientError::ChannelClosed)
    }
}

const DEFAULT_MAX_RESTARTS: u32 = 3;
const DEFAULT_BACKOFF_MS: &[u64] = &[1000, 2000, 4000];

#[derive(Debug, Clone)]
pub struct RestartableConfig {
    pub lsp_config: LspClientConfig,
    pub max_restarts: u32,
    pub backoff_ms: Vec<u64>,
    pub stable_running_ms: u64,
}

impl RestartableConfig {
    pub fn new(lsp_config: LspClientConfig) -> Self {
        Self {
            lsp_config,
            max_restarts: DEFAULT_MAX_RESTARTS,
            backoff_ms: DEFAULT_BACKOFF_MS.to_vec(),
            stable_running_ms: 30_000,
        }
    }
}

#[derive(Debug, Clone)]
pub enum LspSessionStatus {
    Starting,
    Running,
    Restarting { attempt: u32 },
    Stopped,
    Failed { message: String },
}

enum RestartableOutgoing {
    Request {
        method: String,
        params: serde_json::Value,
        response_tx: oneshot::Sender<Result<serde_json::Value, LspClientError>>,
    },
    Notification {
        method: String,
        params: serde_json::Value,
    },
}

pub struct RestartableLspClient {
    request_tx: mpsc::Sender<RestartableOutgoing>,
    notification_rx: Option<mpsc::Receiver<ServerNotification>>,
    server_request_rx: Option<mpsc::Receiver<ServerRequest>>,
    status_rx: Option<mpsc::Receiver<LspSessionStatus>>,
    stop_tx: Option<oneshot::Sender<()>>,
    join_handle: Option<tokio::task::JoinHandle<()>>,
    request_timeout_ms: u64,
}

impl RestartableLspClient {
    pub async fn start(
        config: RestartableConfig,
    ) -> Result<(Self, serde_json::Value), LspClientError> {
        Self::start_with_cancel(config, None).await
    }

    pub async fn start_cancellable(
        config: RestartableConfig,
        mut cancel_rx: oneshot::Receiver<()>,
    ) -> Result<(Self, serde_json::Value), LspClientError> {
        Self::start_with_cancel(config, Some(&mut cancel_rx)).await
    }

    async fn start_with_cancel(
        config: RestartableConfig,
        cancel_rx: Option<&mut oneshot::Receiver<()>>,
    ) -> Result<(Self, serde_json::Value), LspClientError> {
        let request_timeout_ms = config.lsp_config.request_timeout_ms;
        let (request_tx, request_rx) = mpsc::channel::<RestartableOutgoing>(64);
        let (stop_tx, stop_rx) = oneshot::channel::<()>();
        let (notification_tx, notification_rx) = mpsc::channel::<ServerNotification>(64);
        let (server_request_fwd_tx, server_request_rx) = mpsc::channel::<ServerRequest>(16);
        let (status_tx, status_rx) = mpsc::channel::<LspSessionStatus>(16);
        let (ready_tx, ready_rx) =
            oneshot::channel::<Result<serde_json::Value, LspClientError>>();

        let join_handle = tokio::spawn(run_loop(
            config,
            request_rx,
            stop_rx,
            notification_tx,
            server_request_fwd_tx,
            status_tx,
            Some(ready_tx),
        ));

        let server_capabilities = if let Some(cancel_rx) = cancel_rx {
            tokio::select! {
                ready = ready_rx => ready.map_err(|_| LspClientError::ChannelClosed)??,
                _ = cancel_rx => {
                    let _ = stop_tx.send(());
                    let _ = join_handle.await;
                    return Err(LspClientError::ChannelClosed);
                }
            }
        } else {
            ready_rx.await.map_err(|_| LspClientError::ChannelClosed)??
        };

        Ok((Self {
            request_tx,
            notification_rx: Some(notification_rx),
            server_request_rx: Some(server_request_rx),
            status_rx: Some(status_rx),
            stop_tx: Some(stop_tx),
            join_handle: Some(join_handle),
            request_timeout_ms,
        }, server_capabilities))
    }

    pub fn request_handle(&self) -> LspRequestHandle {
        LspRequestHandle {
            tx: self.request_tx.clone(),
            request_timeout_ms: self.request_timeout_ms,
        }
    }

    pub fn take_notification_rx(&mut self) -> Option<mpsc::Receiver<ServerNotification>> {
        self.notification_rx.take()
    }

    pub fn take_server_request_rx(&mut self) -> Option<mpsc::Receiver<ServerRequest>> {
        self.server_request_rx.take()
    }

    pub fn take_status_rx(&mut self) -> Option<mpsc::Receiver<LspSessionStatus>> {
        self.status_rx.take()
    }

    pub async fn send_request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, LspClientError> {
        let (response_tx, response_rx) = oneshot::channel();
        self.request_tx
            .send(RestartableOutgoing::Request {
                method: method.to_string(),
                params,
                response_tx,
            })
            .await
            .map_err(|_| LspClientError::ChannelClosed)?;

        tokio::time::timeout(
            std::time::Duration::from_millis(self.request_timeout_ms),
            response_rx,
        )
        .await
        .map_err(|_| LspClientError::RequestTimeout)?
        .map_err(|_| LspClientError::ChannelClosed)?
    }

    pub async fn send_notification(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<(), LspClientError> {
        self.request_tx
            .send(RestartableOutgoing::Notification {
                method: method.to_string(),
                params,
            })
            .await
            .map_err(|_| LspClientError::ChannelClosed)
    }

    pub fn is_alive(&self) -> bool {
        !self.request_tx.is_closed()
    }

    pub async fn stop(mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.await;
        }
    }
}

pub fn is_retryable(err: &LspClientError) -> bool {
    matches!(
        err,
        LspClientError::ProcessSpawnFailed(_)
            | LspClientError::InitEof { .. }
            | LspClientError::ProcessExited
    )
}

fn emit_status(status_tx: &mpsc::Sender<LspSessionStatus>, status: LspSessionStatus) {
    let _ = status_tx.try_send(status);
}

async fn run_loop(
    config: RestartableConfig,
    mut request_rx: mpsc::Receiver<RestartableOutgoing>,
    mut stop_rx: oneshot::Receiver<()>,
    notification_fwd_tx: mpsc::Sender<ServerNotification>,
    server_request_fwd_tx: mpsc::Sender<ServerRequest>,
    status_tx: mpsc::Sender<LspSessionStatus>,
    mut ready_tx: Option<oneshot::Sender<Result<serde_json::Value, LspClientError>>>,
) {
    let mut restart_count: u32 = 0;

    loop {
        emit_status(&status_tx, LspSessionStatus::Starting);

        let client_result = tokio::select! {
            _ = &mut stop_rx => {
                emit_status(&status_tx, LspSessionStatus::Stopped);
                return;
            }
            result = LspClient::start(config.lsp_config.clone()) => result,
        };
        let mut client = match client_result {
            Ok(c) => c,
            Err(e) => {
                log::error!("RestartableLspClient: spawn failed: {}", e);
                if is_retryable(&e) && restart_count < config.max_restarts {
                    let delay = backoff_delay(&config.backoff_ms, restart_count);
                    restart_count += 1;
                    emit_status(
                        &status_tx,
                        LspSessionStatus::Restarting {
                            attempt: restart_count,
                        },
                    );
                    log::info!(
                        "RestartableLspClient: retrying in {}ms (attempt {})",
                        delay,
                        restart_count
                    );
                    if wait_for_backoff_or_stop(delay, &mut stop_rx).await {
                        emit_status(&status_tx, LspSessionStatus::Stopped);
                        return;
                    }
                    continue;
                }
                let failed_status = LspSessionStatus::Failed {
                    message: e.to_string(),
                };
                emit_status(&status_tx, failed_status);
                if let Some(tx) = ready_tx.take() {
                    let _ = tx.send(Err(e));
                }
                return;
            }
        };

        emit_status(&status_tx, LspSessionStatus::Running);
        if let Some(tx) = ready_tx.take() {
            let _ = tx.send(Ok(client.server_capabilities().clone()));
        }
        let stable_timer = tokio::time::sleep(std::time::Duration::from_millis(
            config.stable_running_ms,
        ));
        tokio::pin!(stable_timer);
        let mut stability_recorded = false;

        let mut inner_notification_rx = client
            .take_notification_rx()
            .expect("notification_rx available on fresh LspClient");
        let mut inner_server_request_rx = client
            .take_server_request_rx()
            .expect("server_request_rx available on fresh LspClient");

        let terminated = loop {
            tokio::select! {
                _ = &mut stable_timer, if !stability_recorded => {
                    restart_count = 0;
                    stability_recorded = true;
                }
                _ = &mut stop_rx => {
                    client.stop().await;
                    break true;
                }
                notification = inner_notification_rx.recv() => {
                    match notification {
                        Some(n) => {
                            let _ = notification_fwd_tx.send(n).await;
                        }
                        None => {
                            log::warn!("RestartableLspClient: inner client died (notification channel closed)");
                            break false;
                        }
                    }
                }
                server_req = inner_server_request_rx.recv() => {
                    if let Some(req) = server_req {
                        let _ = server_request_fwd_tx.send(req).await;
                    }
                }
                msg = request_rx.recv() => {
                    match msg {
                        Some(RestartableOutgoing::Request { method, params, response_tx }) => {
                            let result = client.send_request(&method, params).await;
                            let _ = response_tx.send(result);
                        }
                        Some(RestartableOutgoing::Notification { method, params }) => {
                            if let Err(e) = client.send_notification(&method, params).await {
                                log::error!("RestartableLspClient: notification failed: {}", e);
                            }
                        }
                        None => break true,
                    }
                }
            }
        };

        if terminated {
            emit_status(&status_tx, LspSessionStatus::Stopped);
            return;
        }

        if restart_count < config.max_restarts {
            let delay = backoff_delay(&config.backoff_ms, restart_count);
            restart_count += 1;
            emit_status(
                &status_tx,
                LspSessionStatus::Restarting {
                    attempt: restart_count,
                },
            );
            log::info!(
                "RestartableLspClient: process crashed, restarting in {}ms (attempt {})",
                delay,
                restart_count
            );
            if wait_for_backoff_or_stop(delay, &mut stop_rx).await {
                emit_status(&status_tx, LspSessionStatus::Stopped);
                return;
            }
        } else {
            log::error!("RestartableLspClient: exceeded max restart attempts");
            emit_status(
                &status_tx,
                LspSessionStatus::Failed {
                    message: "Process crashed repeatedly, giving up".to_string(),
                },
            );
            return;
        }
    }
}

fn backoff_delay(backoff_ms: &[u64], attempt: u32) -> u64 {
    let idx = (attempt as usize).min(backoff_ms.len().saturating_sub(1));
    backoff_ms.get(idx).copied().unwrap_or(4000)
}

async fn wait_for_backoff_or_stop(
    delay_ms: u64,
    stop_rx: &mut oneshot::Receiver<()>,
) -> bool {
    tokio::select! {
        _ = stop_rx => true,
        _ = tokio::time::sleep(std::time::Duration::from_millis(delay_ms)) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn stop_preempts_backoff() {
        let (stop_tx, mut stop_rx) = oneshot::channel();
        stop_tx.send(()).unwrap();

        let stopped = tokio::time::timeout(
            std::time::Duration::from_millis(100),
            wait_for_backoff_or_stop(30_000, &mut stop_rx),
        )
        .await
        .expect("stop should preempt backoff");

        assert!(stopped);
    }

    #[test]
    fn restart_backoff_caps_at_last_delay() {
        assert_eq!(backoff_delay(&[1, 2, 4], 0), 1);
        assert_eq!(backoff_delay(&[1, 2, 4], 3), 4);
    }

    #[cfg(unix)]
    fn test_config(script: &str) -> RestartableConfig {
        RestartableConfig {
            lsp_config: LspClientConfig {
                binary_path: "python3".to_string(),
                args: vec!["-u".to_string(), "-c".to_string(), script.to_string()],
                root_uri: "file:///vault".to_string(),
                capabilities: serde_json::json!({}),
                working_dir: None,
                request_timeout_ms: 100,
                init_timeout_ms: 30_000,
            },
            max_restarts: 2,
            backoff_ms: vec![5, 10],
            stable_running_ms: 1_000,
        }
    }

    #[cfg(unix)]
    const INITIALIZE_THEN_EXIT: &str = r#"
import json, sys, time

def read_message():
    length = 0
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        if line in (b'\r\n', b'\n'):
            break
        if line.lower().startswith(b'content-length:'):
            length = int(line.split(b':', 1)[1])
    return json.loads(sys.stdin.buffer.read(length))

request = read_message()
response = json.dumps({'jsonrpc': '2.0', 'id': request['id'], 'result': {'capabilities': {}}}).encode()
sys.stdout.buffer.write(b'Content-Length: ' + str(len(response)).encode() + b'\r\n\r\n' + response)
sys.stdout.buffer.flush()
read_message()
time.sleep(0.01)
"#;

    #[cfg(unix)]
    const HANG_DURING_INITIALIZE: &str = r#"
import sys, time
while True:
    line = sys.stdin.buffer.readline()
    if not line or line in (b'\r\n', b'\n'):
        break
time.sleep(60)
"#;

    #[cfg(unix)]
    #[tokio::test]
    async fn repeated_post_initialize_exits_reach_failed() {
        let (mut client, _) = RestartableLspClient::start(test_config(INITIALIZE_THEN_EXIT))
            .await
            .expect("initial server starts");
        let mut status_rx = client.take_status_rx().expect("status receiver");

        let failed = tokio::time::timeout(std::time::Duration::from_secs(1), async {
            while let Some(status) = status_rx.recv().await {
                if matches!(status, LspSessionStatus::Failed { .. }) {
                    return true;
                }
            }
            false
        })
        .await
        .expect("restart cap should be reached");

        assert!(failed);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn stop_during_crash_backoff_returns_promptly() {
        let (client, _) = RestartableLspClient::start(test_config(INITIALIZE_THEN_EXIT))
            .await
            .expect("initial server starts");
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;

        tokio::time::timeout(std::time::Duration::from_millis(200), client.stop())
            .await
            .expect("stop should preempt crash backoff");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancellation_during_initialize_kills_child_promptly() {
        let (cancel_tx, cancel_rx) = oneshot::channel();
        let start = tokio::spawn(RestartableLspClient::start_cancellable(
            test_config(HANG_DURING_INITIALIZE),
            cancel_rx,
        ));
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
        cancel_tx.send(()).expect("start still pending");

        let result = tokio::time::timeout(std::time::Duration::from_millis(200), start)
            .await
            .expect("cancel should preempt initialize")
            .expect("start task should finish");
        assert!(matches!(result, Err(LspClientError::ChannelClosed)));
    }
}
