use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt};

use crate::features::mcp::router::McpRouter;
use crate::features::mcp::types::parse_jsonrpc;

pub async fn run_jsonrpc_stream<R, W>(
    reader: R,
    mut writer: W,
    router: std::sync::Arc<tokio::sync::Mutex<McpRouter>>,
    shutdown: tokio::sync::watch::Receiver<bool>,
) -> Result<(), String>
where
    R: AsyncBufRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut lines = reader.lines();
    let mut shutdown = shutdown;

    loop {
        tokio::select! {
            line = lines.next_line() => {
                let line = line.map_err(|e| format!("IO error: {}", e))?;
                let Some(line) = line else {
                    log::info!("MCP transport: EOF on input stream");
                    break;
                };

                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                let response = match parse_jsonrpc(trimmed) {
                    Ok(request) => {
                        let mut r = router.lock().await;
                        r.handle_request(&request)
                    }
                    Err(err_response) => Some(err_response),
                };

                if let Some(resp) = response {
                    let serialized = serde_json::to_string(&resp)
                        .map_err(|e| format!("Serialization error: {}", e))?;
                    writer.write_all(serialized.as_bytes()).await
                        .map_err(|e| format!("Write error: {}", e))?;
                    writer.write_all(b"\n").await
                        .map_err(|e| format!("Write error: {}", e))?;
                    writer.flush().await
                        .map_err(|e| format!("Flush error: {}", e))?;
                }
            }
            _ = shutdown.changed() => {
                if *shutdown.borrow() {
                    log::info!("MCP transport: shutdown signal received");
                    break;
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::Mutex;

    fn make_router() -> Arc<Mutex<McpRouter>> {
        Arc::new(Mutex::new(McpRouter::new()))
    }

    async fn run_with_input(input: &str) -> String {
        let reader = tokio::io::BufReader::new(input.as_bytes());
        let mut output = Vec::new();
        let (_tx, rx) = tokio::sync::watch::channel(false);
        let router = make_router();

        run_jsonrpc_stream(reader, &mut output, router, rx)
            .await
            .unwrap();

        String::from_utf8(output).unwrap()
    }

    fn parse_response(line: &str) -> serde_json::Value {
        serde_json::from_str(line).expect("valid JSON response")
    }

    #[tokio::test]
    async fn ping_returns_empty_object() {
        let input = r#"{"jsonrpc":"2.0","method":"ping","id":1}"#;
        let output = run_with_input(&format!("{}\n", input)).await;
        let resp = parse_response(output.trim());
        assert_eq!(resp["result"], serde_json::json!({}));
        assert_eq!(resp["id"], 1);
    }

    #[tokio::test]
    async fn initialize_returns_server_info() {
        let input = r#"{"jsonrpc":"2.0","method":"initialize","params":{"protocol_version":"2024-11-05","capabilities":{},"client_info":{"name":"test"}},"id":1}"#;
        let output = run_with_input(&format!("{}\n", input)).await;
        let resp = parse_response(output.trim());
        assert_eq!(resp["result"]["server_info"]["name"], "carbide");
        assert!(resp["result"]["protocol_version"].is_string());
    }

    #[tokio::test]
    async fn invalid_json_returns_parse_error() {
        let output = run_with_input("not valid json\n").await;
        let resp = parse_response(output.trim());
        assert_eq!(resp["error"]["code"], -32700);
    }

    #[tokio::test]
    async fn unknown_method_returns_method_not_found() {
        let input = r#"{"jsonrpc":"2.0","method":"nonexistent","id":1}"#;
        let output = run_with_input(&format!("{}\n", input)).await;
        let resp = parse_response(output.trim());
        assert_eq!(resp["error"]["code"], -32601);
    }

    #[tokio::test]
    async fn notification_produces_no_output() {
        let input = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
        let output = run_with_input(&format!("{}\n", input)).await;
        assert!(output.is_empty());
    }

    #[tokio::test]
    async fn empty_lines_are_skipped() {
        let input = "\n\n\n";
        let output = run_with_input(input).await;
        assert!(output.is_empty());
    }

    #[tokio::test]
    async fn multiple_requests_processed_sequentially() {
        let input = format!(
            "{}\n{}\n",
            r#"{"jsonrpc":"2.0","method":"ping","id":1}"#,
            r#"{"jsonrpc":"2.0","method":"ping","id":2}"#,
        );
        let output = run_with_input(&input).await;
        let lines: Vec<&str> = output.trim().lines().collect();
        assert_eq!(lines.len(), 2);
        let r1 = parse_response(lines[0]);
        let r2 = parse_response(lines[1]);
        assert_eq!(r1["id"], 1);
        assert_eq!(r2["id"], 2);
    }

    #[tokio::test]
    async fn shutdown_signal_stops_processing() {
        let (tx, rx) = tokio::sync::watch::channel(false);
        let router = make_router();

        let (reader, mut writer) = tokio::io::duplex(1024);
        let buf_reader = tokio::io::BufReader::new(reader);
        let mut output = Vec::new();

        let handle = tokio::spawn(async move {
            run_jsonrpc_stream(buf_reader, &mut output, router, rx).await
        });

        tx.send(true).unwrap();
        drop(writer);

        let result = handle.await.unwrap();
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn tools_list_returns_note_tools() {
        let input = r#"{"jsonrpc":"2.0","method":"tools/list","id":1}"#;
        let output = run_with_input(&format!("{}\n", input)).await;
        let resp = parse_response(output.trim());
        let tools = resp["result"]["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 17);
    }

    #[tokio::test]
    async fn invalid_jsonrpc_version_returns_error() {
        let input = r#"{"jsonrpc":"1.0","method":"ping","id":1}"#;
        let output = run_with_input(&format!("{}\n", input)).await;
        let resp = parse_response(output.trim());
        assert_eq!(resp["error"]["code"], -32600);
    }
}
