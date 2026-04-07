use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::client::CarbideClient;

pub async fn run_proxy(client: &CarbideClient) -> Result<(), String> {
    let stdin = BufReader::new(tokio::io::stdin());
    let mut stdout = tokio::io::stdout();
    let mut lines = stdin.lines();

    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|e| format!("stdin read error: {e}"))?
    {
        if line.trim().is_empty() {
            continue;
        }

        match client.post_mcp_raw(&line).await {
            Ok(Some(response)) => {
                stdout
                    .write_all(response.as_bytes())
                    .await
                    .map_err(|e| format!("stdout write error: {e}"))?;
                stdout
                    .write_all(b"\n")
                    .await
                    .map_err(|e| format!("stdout write error: {e}"))?;
                stdout
                    .flush()
                    .await
                    .map_err(|e| format!("stdout flush error: {e}"))?;
            }
            Ok(None) => {
                // 204 No Content — notification, no response needed
            }
            Err(e) => {
                eprintln!("proxy error: {e}");
            }
        }
    }

    Ok(())
}
