# MCP Transport Extensions + Terminal Bug Fixes

**Date:** 2026-04-06
**Branch targets:** `feat/mcp-streamable-http`, then `feat/mcp-stdio-proxy`; terminal bugs on current branch
**Companion:** `2026-04-05_conversation_work_units.md` — these are candidates for Steps 13–16 interleaving

---

## Context

The HTTP MCP server is now wired correctly (autostart fix in `968750c9`). Two transport improvements are worth building:

1. **Streamable HTTP** — aligns with the 2025-03-26 MCP spec; Claude Code will prefer it; enables future progress streaming for slow tools
2. **stdio via CLI proxy** — fixes Claude Desktop by giving it a proper process-spawn target (`carbide mcp`) rather than relying on HTTP config support

Three terminal bugs were also found during this review and should ship first (small, high-impact).

---

## Terminal Bug Fixes (ship first — one session, ~6 files)

### Bug 1 — Inactive session views destroyed on tab switch

**File:** `src/lib/features/terminal/ui/terminal_panel_content.svelte:155–159`

**Problem:** Only the active session is rendered. Switching tabs destroys the xterm.js instance (`onDestroy` → `terminal.dispose()`), losing the entire scrollback buffer. Re-activating creates a blank terminal.

**Current:**

```svelte
{#each session_ids as session_id (session_id)}
  {#if session_id === active_session_id}
    <TerminalSessionView {session_id} active={true} />
  {/if}
{/each}
```

**Fix:** render all session views; control visibility through the `active` prop (which already drives CSS `display: none / block`):

```svelte
{#each session_ids as session_id (session_id)}
  <TerminalSessionView {session_id} active={session_id === active_session_id} />
{/each}
```

The `TerminalSessionView` CSS already handles this correctly. The `active` prop already gates input to prevent background sessions from receiving keystrokes. xterm instances persist across tab switches.

---

### Bug 2 — `fixed_cwd` uses current vault path instead of stored session cwd

**File:** `src/lib/features/terminal/ui/terminal_session_view.svelte:39–44`

**Problem:** When a session has `cwd_policy: "fixed"`, the `fixed_cwd` passed to `resolve_terminal_session_target` is always the current vault path, not the session's stored cwd. If the user opened a session at `/home/user/project` and later switches vaults, respawning uses the vault path.

**Current:**

```ts
const target = resolve_terminal_session_target({
  follow_active_vault: stores.ui.editor_settings.terminal_follow_active_vault,
  followed_cwd: stores.vault.vault?.path ?? undefined,
  fixed_cwd: stores.vault.vault?.path ?? undefined, // wrong for existing sessions
});
```

**Fix:** read stored session cwd:

```ts
const session = stores.terminal.get_session(session_id);
const target = resolve_terminal_session_target({
  follow_active_vault: stores.ui.editor_settings.terminal_follow_active_vault,
  followed_cwd: stores.vault.vault?.path ?? undefined,
  fixed_cwd: session?.cwd ?? stores.vault.vault?.path ?? undefined,
});
```

Note: `terminal_panel_content.svelte` and `terminal_actions.ts` also pass `vault_path` as `fixed_cwd` but those are for new session creation (vault path as initial cwd is correct there).

---

### Bug 3 — Toggling/closing the terminal panel kills all PTY processes

**Files:** `src/lib/features/terminal/application/terminal_actions.ts:47,62`, `src/lib/features/terminal/state/terminal_store.svelte.ts`

**Problem:** `terminal_toggle` and `terminal_close` both call `terminal_service.close_all_sessions()`, which sends SIGKILL to every shell. Re-opening the panel creates fresh blank terminals. Sessions should survive panel show/hide.

**Root cause:** `TerminalStore.close()` clears `sessions` and `session_ids` in addition to `panel_open`. It's called by both hide-panel code paths and genuine destroy paths.

**Fix — split `TerminalStore.close()` into two methods:**

```ts
// Just hide the panel, preserve sessions
hide(): void {
  this.panel_open = false;
  this.focused = false;
}

// Destructive: clears all session state (for actual teardown)
reset(): void {
  this.panel_open = false;
  this.focused = false;
  this.active_session_id = null;
  this.session_ids = [];
  this.sessions = new Map();
}
```

**Update actions:**

```ts
// terminal_toggle: only hide/show, never kill
if (ui_store.bottom_panel_open && ui_store.bottom_panel_tab === "terminal") {
  ui_store.bottom_panel_open = false;
  terminal_store.hide();
  return;
}
ui_store.bottom_panel_tab = "terminal";
ui_store.bottom_panel_open = true;
terminal_store.open();

// terminal_close: same — hide only
// terminal_close_session: unchanged (kills the specific session's process)
```

`close_all_sessions()` is still needed for app shutdown and the explicit "kill all" path; rename callers accordingly. Update `TerminalService.destroy()` to call `reset()`.

---

### Design issue — `reconcile_session` respawns manual-policy sessions

**File:** `src/lib/features/terminal/application/terminal_service.ts:202–216`

**Problem:** `reconcile_session` calls `respawn_session` unconditionally, which kills the process. For sessions with `respawn_policy: "manual"`, only metadata should update — not the running shell.

**Fix:**

```ts
async reconcile_session(session_id: string, input: TerminalSessionReconcileInput): Promise<string> {
  const session = this.terminal_store.get_session(session_id);

  this.terminal_store.ensure_session(
    { id: session_id, ...input, cwd: input.cwd ?? null },
    { activate: false },
  );

  if (session?.respawn_policy !== "on_context_change") {
    return session_id;  // metadata updated, process untouched
  }

  const runtime = this.ensure_runtime(session_id);
  this.cleanup_process(runtime, true);
  await this.spawn_session(session_id, runtime, {
    cols: runtime.process?.cols ?? 80,
    rows: runtime.process?.rows ?? 24,
    ...input,
  });
  return session_id;
}
```

---

## Part 1: Streamable HTTP Transport

**Branch:** `feat/mcp-streamable-http`
**Spec ref:** [MCP 2025-03-26 Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)
**Depends on:** current HTTP server wiring

### What the spec requires (MVP scope)

| Feature                                                     | In scope                 | Notes                                              |
| ----------------------------------------------------------- | ------------------------ | -------------------------------------------------- |
| POST `/mcp` with `Content-Type: application/json` response  | Already implemented      | Keep as default                                    |
| POST `/mcp` with `Accept: text/event-stream` → SSE response | **Yes**                  | Main new behavior                                  |
| `Mcp-Session-Id` header on `initialize`                     | **Yes**                  | Clients expect this                                |
| `Mcp-Session-Id` validation on subsequent requests          | Soft (log, don't reject) | Stateless tools make hard validation unnecessary   |
| GET `/mcp` (server-initiated push)                          | Stub only                | No server-push events yet; return empty SSE stream |

### Unit: Streamable HTTP in `http.rs` — **Rust session**

**Files:** `src-tauri/src/features/mcp/http.rs`, `Cargo.toml` (check if `futures` needed)

Axum 0.8 has built-in SSE via `axum::response::sse`. No new dependencies needed.

#### Changes

**1. Session ID generation helper:**

```rust
fn new_session_id() -> String {
    let mut bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}
```

**2. Upgrade `mcp_handler` signature and routing:**

```rust
// Add GET route to build_router:
.route("/mcp", get(mcp_get_handler).post(mcp_post_handler))
```

**3. POST handler — branch on `Accept` header:**

```rust
async fn mcp_post_handler(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
    body: String,
) -> impl IntoResponse {
    if let Err(status) = check_auth(&headers, state.token()) {
        return auth_error_response().into_response();
    }

    let request = match serde_json::from_str::<JsonRpcRequest>(&body) {
        Ok(r) => r,
        Err(e) => return parse_error_response(e).into_response(),
    };

    let mut router = McpRouter::with_app(state.app().clone());
    let is_initialize = request.method == "initialize";
    let response = router.handle_request(&request);

    let wants_sse = headers
        .get(axum::http::header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.contains("text/event-stream"))
        .unwrap_or(false);

    match response {
        None => StatusCode::NO_CONTENT.into_response(),
        Some(resp) if wants_sse => {
            let mut response = sse_response(resp).into_response();
            if is_initialize {
                response.headers_mut().insert(
                    "Mcp-Session-Id",
                    new_session_id().parse().unwrap(),
                );
            }
            response
        }
        Some(resp) => {
            let mut response = (StatusCode::OK, Json(resp)).into_response();
            if is_initialize {
                response.headers_mut().insert(
                    "Mcp-Session-Id",
                    new_session_id().parse().unwrap(),
                );
            }
            response
        }
    }
}
```

**4. SSE response helper:**

```rust
fn sse_response(response: JsonRpcResponse) -> impl IntoResponse {
    use axum::response::sse::{Event, KeepAlive, Sse};
    use futures::stream;

    let data = serde_json::to_string(&response).unwrap_or_default();
    let event = Event::default().event("message").data(data);
    let s = stream::once(async move { Ok::<_, std::convert::Infallible>(event) });
    Sse::new(s).keep_alive(KeepAlive::default())
}
```

**5. GET `/mcp` stub — empty SSE stream for spec compliance:**

```rust
async fn mcp_get_handler(
    State(state): State<Arc<HttpAppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(status) = check_auth(&headers, state.token()) {
        return status.into_response();
    }
    use axum::response::sse::{KeepAlive, Sse};
    use futures::stream;
    let s = stream::empty::<Result<axum::response::sse::Event, std::convert::Infallible>>();
    Sse::new(s).keep_alive(KeepAlive::default()).into_response()
}
```

If `futures` isn't already in `Cargo.toml`, add it — or use `tokio_stream::once` which is already available via `tokio`.

#### Tests (6 new)

- POST with `Accept: text/event-stream` returns `Content-Type: text/event-stream`
- POST without SSE accept returns `Content-Type: application/json` (existing behavior preserved)
- POST initialize returns `Mcp-Session-Id` header
- POST non-initialize does not return `Mcp-Session-Id`
- GET `/mcp` returns 200 with `text/event-stream`
- GET `/mcp` without auth returns 401

### Unit: Update Desktop config format — **Rust session** (can combine with above)

**File:** `src-tauri/src/features/mcp/setup.rs`

Add `"type": "http"` to the Desktop entry for consistency with Code entry:

```rust
fn build_desktop_entry(token: &str) -> serde_json::Value {
    serde_json::json!({
        "type": "http",
        "url": mcp_server_url(),
        "headers": { "Authorization": format!("Bearer {}", token) }
    })
}
```

Update `write_claude_desktop_config` to use `build_desktop_entry` instead of `build_mcp_server_entry`.

Update 2 existing config tests to assert `"type": "http"` in the Desktop entry.

---

## Part 2: stdio via CLI Proxy

**Branch:** `feat/mcp-stdio-proxy`
**Depends on:** Part 1 (proxy must handle SSE responses from the server)

### What this enables

Claude Desktop's traditional flow: it spawns `carbide mcp` as a child process, communicates over stdin/stdout. Config becomes:

```json
{
  "mcpServers": {
    "carbide": {
      "command": "/usr/local/bin/carbide",
      "args": ["mcp"]
    }
  }
}
```

The app must be running for this to work. `ensure_running()` already handles launching it.

### Unit: `carbide mcp` subcommand — **Rust session**

**Files:**

- `src-tauri/crates/carbide-cli/src/main.rs` (add `Mcp` variant)
- `src-tauri/crates/carbide-cli/src/commands/mcp.rs` (new)
- `src-tauri/crates/carbide-cli/src/client.rs` (add `post_mcp`)

#### `client.rs` — add `post_mcp`

Handles both plain JSON and SSE responses from the server transparently:

```rust
pub async fn post_mcp(&self, body: &str) -> Result<String, String> {
    let resp = self.http
        .post(format!("{}/mcp", BASE_URL))
        .bearer_auth(&self.token)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")  // request plain JSON — simpler for proxy
        .body(body.to_owned())
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    if status == reqwest::StatusCode::NO_CONTENT {
        return Ok(String::new());  // notification — no output
    }

    let content_type = resp.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();

    let text = resp.text().await.map_err(|e| format!("response read error: {e}"))?;

    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, text));
    }

    if content_type.contains("text/event-stream") {
        // Extract JSON from "data: {...}" SSE line
        Ok(text.lines()
            .find(|l| l.starts_with("data: "))
            .map(|l| l[6..].to_owned())
            .unwrap_or(text))
    } else {
        Ok(text)
    }
}
```

#### `commands/mcp.rs` — stdio proxy loop

```rust
use crate::client::CarbideClient;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

pub async fn run_stdio_proxy(client: &CarbideClient) -> Result<(), String> {
    let stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();
    let mut lines = BufReader::new(stdin).lines();

    while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        match client.post_mcp(trimmed).await {
            Ok(response) if response.is_empty() => {}  // notification — no output
            Ok(response) => {
                stdout.write_all(response.as_bytes()).await.map_err(|e| e.to_string())?;
                stdout.write_all(b"\n").await.map_err(|e| e.to_string())?;
                stdout.flush().await.map_err(|e| e.to_string())?;
            }
            Err(e) => {
                // Write JSON-RPC error so the MCP client sees a structured failure
                let err = serde_json::json!({
                    "jsonrpc": "2.0",
                    "error": { "code": -32603, "message": e },
                    "id": null
                });
                stdout.write_all(err.to_string().as_bytes()).await.map_err(|e| e.to_string())?;
                stdout.write_all(b"\n").await.map_err(|e| e.to_string())?;
                stdout.flush().await.map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}
```

#### `main.rs` — routing

```rust
// In Command enum:
#[command(about = "Run as MCP stdio server proxy (for Claude Desktop)")]
Mcp,

// In main() dispatch — before ensure_running, no vault resolution needed:
Command::Mcp => {
    let client = match CarbideClient::new() {
        Ok(c) => c,
        Err(e) => { eprintln!("error: {}", e); std::process::exit(1); }
    };
    // Longer timeout — Desktop launches app if not running
    let poll_deadline = std::time::Duration::from_secs(30);
    if let Err(e) = ensure_running_with_timeout(&client, poll_deadline).await {
        eprintln!("error: {}", e); std::process::exit(1);
    }
    if let Err(e) = commands::mcp::run_stdio_proxy(&client).await {
        eprintln!("error: {}", e); std::process::exit(1);
    }
    return;
}
```

Extract `ensure_running_with_timeout(client, duration)` from existing `ensure_running` (which hardcodes 10s) so the proxy can pass 30s.

### Unit: Update Desktop setup config to use stdio — **Rust session** (combine with above)

**File:** `src-tauri/src/features/mcp/setup.rs`

Change `write_claude_desktop_config` to write a stdio entry pointing to the CLI binary:

```rust
fn carbide_cli_path() -> Option<String> {
    // Check standard install locations
    for candidate in ["/usr/local/bin/carbide", "/opt/homebrew/bin/carbide"] {
        if std::path::Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
    }
    None
}

pub fn write_claude_desktop_config(token: &str) -> Result<SetupResult, String> {
    let cli_path = carbide_cli_path()
        .ok_or("carbide CLI not found at /usr/local/bin/carbide. Run `carbide --install-cli` first.")?;

    // ... existing config merge logic ...

    servers.as_object_mut()
        .ok_or("mcpServers is not an object")?
        .insert("carbide".to_string(), serde_json::json!({
            "command": cli_path,
            "args": ["mcp"]
        }));

    // ...
}
```

Extend `SetupStatus` with `cli_installed: bool`:

```rust
pub struct SetupStatus {
    pub claude_desktop_configured: bool,
    pub claude_code_configured: bool,
    pub http_port: u16,
    pub token_exists: bool,
    pub cli_installed: bool,  // new
}
```

Update `get_setup_status` to populate it via `carbide_cli_path().is_some()`.

Frontend `McpSetupStatus` type and settings UI get a new indicator: if `!cli_installed`, the Desktop setup button shows a warning with instructions to run `carbide --install-cli`.

**Note:** The HTTP config is retained for Claude Code (`.mcp.json` with `type: "http"`). Desktop gets stdio; Code gets HTTP. This matches how each client actually works.

#### Tests (3 new)

- `post_mcp` extracts data from SSE response
- `post_mcp` passes through plain JSON response
- `run_stdio_proxy` skips empty lines (unit test with mock client)
- `carbide_cli_path` returns None when binary absent (on test machine, mocking path)
- `SetupStatus` serializes `cli_installed` field

---

## Part 3: CLI Improvements (fold into Rust sessions)

These are small additions identified during implementation review. Fold into the two Rust sessions above rather than a separate session.

### Required: `ensure_running_with_timeout` extraction

**File:** `src-tauri/crates/carbide-cli/src/main.rs:195–215`

`ensure_running` hardcodes 10s. The MCP proxy needs 30s (Claude Desktop cold-launches the app). Extract:

```rust
async fn ensure_running_with_timeout(client: &CarbideClient, timeout: Duration) -> Result<(), String> {
    if client.health().await.is_ok() {
        return Ok(());
    }
    eprintln!("Carbide is not running. Attempting to launch...");
    launch_app()?;
    let poll_interval = Duration::from_millis(500);
    let deadline = std::time::Instant::now() + timeout;
    while std::time::Instant::now() < deadline {
        tokio::time::sleep(poll_interval).await;
        if client.health().await.is_ok() {
            eprintln!("Carbide is ready.");
            return Ok(());
        }
    }
    Err(format!("timed out waiting for Carbide to start ({:.0}s). Launch it manually and retry.", timeout.as_secs()))
}

async fn ensure_running(client: &CarbideClient) -> Result<(), String> {
    ensure_running_with_timeout(client, Duration::from_secs(10)).await
}
```

All existing callers stay unchanged. `Command::Mcp` passes `Duration::from_secs(30)`.

---

### Required: `Command::Mcp` dispatch placement

`Mcp` does not need vault resolution and owns stdin/stdout for the proxy loop. It must be dispatched in `main()` alongside the `Status`/`Vaults` early-exit arm, **before** the `resolve_vault` block. Update the `unreachable!()` guard at the bottom of `run_command` to include `Command::Mcp`.

---

### Addition: `carbide setup` subcommand

`write_claude_desktop_config` and `write_claude_code_config` are currently GUI-only. Exposing them as CLI commands enables scripted setup. The backend is already complete in `setup.rs`.

**Files:** `main.rs` (new variant), new `/cli/mcp/setup` route in `cli_routes.rs`, `commands/setup.rs` (new, small)

```rust
#[derive(Subcommand)]
enum SetupTarget {
    #[command(about = "Configure Claude Desktop (stdio entry)")]
    Desktop,
    #[command(about = "Configure Claude Code (.mcp.json in vault)")]
    Code,
}

// In Command enum:
#[command(about = "Configure Claude AI client integrations")]
Setup {
    #[command(subcommand)]
    target: SetupTarget,
},
```

Dispatch in `main()` before `resolve_vault` (Desktop needs no vault; Code requires vault resolution — handle the split in `run_command`).

Human-readable output mirrors `SetupResult.message`. JSON output emits the full struct.

---

### Addition: MCP/CLI info in `carbide status`

`carbide status` currently shows version and active vault. Extend the human-readable output to include MCP server address and `cli_installed` (already added to `SetupStatus` by the stdio config unit):

```
Carbide is running
  version: 0.x.x
  active vault: my-vault
  MCP server: http://127.0.0.1:3457
  CLI installed: yes
```

**File:** `main.rs:300–320` (the `Command::Status` arm). No new backend calls needed — `/cli/status` already returns everything required once `cli_installed` is added.

---

## Summary: Work units

| Unit                                            | Files                                           | Session type      | Effort                            |
| ----------------------------------------------- | ----------------------------------------------- | ----------------- | --------------------------------- |
| Terminal bugs 1–3 + design issue                | 4 TS/Svelte + 2 test files                      | TypeScript/Svelte | Small                             |
| Streamable HTTP POST + GET stub                 | `http.rs`                                       | Rust              | Small-medium                      |
| Desktop config `type: "http"`                   | `setup.rs`                                      | Rust              | Trivial (fold into above)         |
| `carbide mcp` + `post_mcp` + timeout extraction | `main.rs`, `commands/mcp.rs`, `client.rs`       | Rust              | Small                             |
| Desktop stdio config + `cli_installed`          | `setup.rs` + frontend type                      | Rust + TS         | Small                             |
| `carbide setup` subcommand                      | `main.rs`, `commands/setup.rs`, `cli_routes.rs` | Rust              | Trivial (fold into stdio session) |
| MCP/CLI info in `carbide status`                | `main.rs`                                       | Rust              | Trivial (fold into stdio session) |

All terminal fixes ship in one session. MCP work is two Rust sessions (Streamable HTTP, then stdio proxy + CLI additions).
