use tokio::sync::{mpsc, oneshot};

use super::transport::{LspClient, ServerNotification};
use super::types::{LspClientConfig, LspClientError};

const DEFAULT_MAX_RESTARTS: u32 = 3;
const DEFAULT_BACKOFF_MS: &[u64] = &[1000, 2000, 4000];

#[derive(Debug, Clone)]
pub struct RestartableConfig {
    pub lsp_config: LspClientConfig,
    pub max_restarts: u32,
    pub backoff_ms: Vec<u64>,
}

impl RestartableConfig {
    pub fn new(lsp_config: LspClientConfig) -> Self {
        Self {
            lsp_config,
            max_restarts: DEFAULT_MAX_RESTARTS,
            backoff_ms: DEFAULT_BACKOFF_MS.to_vec(),
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
    status_rx: Option<mpsc::Receiver<LspSessionStatus>>,
    stop_tx: Option<oneshot::Sender<()>>,
    join_handle: Option<tokio::task::JoinHandle<()>>,
}

impl RestartableLspClient {
    pub async fn start(config: RestartableConfig) -> Self {
        let (request_tx, request_rx) = mpsc::channel::<RestartableOutgoing>(64);
        let (stop_tx, stop_rx) = oneshot::channel::<()>();
        let (notification_tx, notification_rx) = mpsc::channel::<ServerNotification>(64);
        let (status_tx, status_rx) = mpsc::channel::<LspSessionStatus>(16);

        let join_handle = tokio::spawn(run_loop(
            config,
            request_rx,
            stop_rx,
            notification_tx,
            status_tx,
        ));

        Self {
            request_tx,
            notification_rx: Some(notification_rx),
            status_rx: Some(status_rx),
            stop_tx: Some(stop_tx),
            join_handle: Some(join_handle),
        }
    }

    pub fn take_notification_rx(&mut self) -> Option<mpsc::Receiver<ServerNotification>> {
        self.notification_rx.take()
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

        response_rx
            .await
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

fn emit_status(status_tx: &mpsc::Sender<LspSessionStatus>, status: LspSessionStatus) {
    let _ = status_tx.try_send(status);
}

async fn run_loop(
    config: RestartableConfig,
    mut request_rx: mpsc::Receiver<RestartableOutgoing>,
    mut stop_rx: oneshot::Receiver<()>,
    notification_fwd_tx: mpsc::Sender<ServerNotification>,
    status_tx: mpsc::Sender<LspSessionStatus>,
) {
    let mut restart_count: u32 = 0;

    loop {
        emit_status(&status_tx, LspSessionStatus::Starting);

        let client_result = LspClient::start(config.lsp_config.clone()).await;
        let mut client = match client_result {
            Ok(c) => c,
            Err(e) => {
                log::error!("RestartableLspClient: spawn failed: {}", e);
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
                        "RestartableLspClient: retrying in {}ms (attempt {})",
                        delay,
                        restart_count
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
                    continue;
                }
                emit_status(
                    &status_tx,
                    LspSessionStatus::Failed {
                        message: e.to_string(),
                    },
                );
                return;
            }
        };

        emit_status(&status_tx, LspSessionStatus::Running);
        restart_count = 0;

        let mut inner_notification_rx = client
            .take_notification_rx()
            .expect("notification_rx available on fresh LspClient");

        let terminated = loop {
            tokio::select! {
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
            tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
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
