use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::auth;

const BASE_URL: &str = "http://127.0.0.1:3457";
const MCP_ENDPOINT: &str = "/mcp";

pub struct CarbideClient {
    http: Client,
    token: String,
}

impl CarbideClient {
    pub fn new() -> Result<Self, String> {
        let token = auth::read_token()?;
        let http = Client::new();
        Ok(Self { http, token })
    }

    pub async fn health(&self) -> Result<(), String> {
        let resp = self
            .http
            .get(format!("{}/health", BASE_URL))
            .send()
            .await
            .map_err(|e| format!("cannot reach Carbide app: {e}"))?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(format!("health check failed: HTTP {}", resp.status()))
        }
    }

    pub async fn post_json<P: Serialize, R: DeserializeOwned>(
        &self,
        path: &str,
        params: &P,
    ) -> Result<R, String> {
        let resp = self
            .http
            .post(format!("{}{}", BASE_URL, path))
            .bearer_auth(&self.token)
            .json(params)
            .send()
            .await
            .map_err(|e| format!("request failed: {e}"))?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| format!("failed to read response: {e}"))?;

        if status.is_success() {
            serde_json::from_str(&body).map_err(|e| format!("invalid JSON response: {e}"))
        } else {
            let err: Result<serde_json::Value, _> = serde_json::from_str(&body);
            match err {
                Ok(v) if v.get("error").is_some() => {
                    Err(v["error"].as_str().unwrap_or(&body).to_string())
                }
                _ => Err(format!("HTTP {}: {}", status, body)),
            }
        }
    }

    pub async fn post_mcp_raw(&self, body: &str) -> Result<Option<String>, String> {
        let resp = self
            .http
            .post(format!("{}{}", BASE_URL, MCP_ENDPOINT))
            .bearer_auth(&self.token)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .body(body.to_string())
            .send()
            .await
            .map_err(|e| format!("MCP request failed: {e}"))?;

        let status = resp.status();

        if status == reqwest::StatusCode::NO_CONTENT {
            return Ok(None);
        }

        let body = resp
            .text()
            .await
            .map_err(|e| format!("failed to read MCP response: {e}"))?;

        if status.is_success() {
            Ok(Some(body))
        } else {
            Err(format!("MCP HTTP {}: {}", status, body))
        }
    }

    pub async fn post_raw<P: Serialize>(&self, path: &str, params: &P) -> Result<String, String> {
        let resp = self
            .http
            .post(format!("{}{}", BASE_URL, path))
            .bearer_auth(&self.token)
            .json(params)
            .send()
            .await
            .map_err(|e| format!("request failed: {e}"))?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| format!("failed to read response: {e}"))?;

        if status.is_success() {
            Ok(body)
        } else {
            let err: Result<serde_json::Value, _> = serde_json::from_str(&body);
            match err {
                Ok(v) if v.get("error").is_some() => {
                    Err(v["error"].as_str().unwrap_or(&body).to_string())
                }
                _ => Err(format!("HTTP {}: {}", status, body)),
            }
        }
    }
}
