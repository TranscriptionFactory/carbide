# Webview Clip Capture (F1 follow-up) — Design

Status: phases 1–3 implemented on `feat/clip-webview-capture` (2026-07-21);
phase 4 (Windows/Linux evaluate-JS) pending — those platforms return an
explicit "not yet supported" error behind the `evaluate_platform` seam.
Origin: archive.ph clip failure (429). Anti-bot CDNs (archive.ph,
Cloudflare challenges) serve CAPTCHA interstitials to every non-interactive
HTTP client regardless of headers — verified with full browser header sets.
`clip_fetch_page` can never satisfy them; only a real browser engine can.
This is the "known limitation" escape hatch documented in
`2026-07-20_web_clipping_plan.md`.

## Prior art (what clippers do)

- **Obsidian Web Clipper / Notion / Evernote / Zotero**: browser extensions
  reading the live DOM of the user's tab. Inherit session, cookies, solved
  CAPTCHAs, JS-rendered content for free. No second fetch.
- **Omnivore / Readwise Reader**: server fetch as default, extension capture
  as fallback for exactly the sites where the fetch fails.

Carbide adopts the Omnivore shape, but with an **in-app webview** instead of
an extension: `clip_fetch_page` stays the default (fast, invisible), and a
visible capture window is the fallback for blocked sites. An extension is
explicitly out of scope (store distribution, per-browser builds, deep-link
protocol — only worth it if authenticated/paywalled capture becomes a
priority; a webview window has a separate cookie jar from the user's daily
browser).

## UX

1. User clips a URL as today. If `clip_fetch_page` fails with a bot-block
   error (403/429), the error toast gains an action: **"Open in capture
   window"** (also reachable any time via a "Use browser capture" checkbox
   in the clip dialog, unchecked by default).
2. A visible `WebviewWindow` (label `clip-capture`) opens on the URL. The
   page loads with a real WebKit/WebView2 engine and fingerprint; most bot
   filters pass silently. If a CAPTCHA appears, the user solves it in the
   window.
3. The main window shows a persistent toast/dialog: **"Capture page"** /
   **"Cancel"**. On capture, Rust evaluates
   `document.documentElement.outerHTML` in the capture webview, closes the
   window, and the result feeds the existing pipeline
   (`extract_readable_content` → images → emit formats) unchanged.

Explicit user-triggered capture (not automatic on `load`) is deliberate:
it is the CAPTCHA/consent-banner/lazy-content escape hatch, and it makes
the "wait for SPA hydration" problem the user's judgement call instead of a
heuristic timeout.

## Architecture

### Rust: `features/clip/capture.rs`

Follows the `features/export/mod.rs` pattern (hidden window + `with_webview`
platform code + oneshot channels + timeouts), with a visible window.

```
clip_capture_start(url) -> Result<(), String>
  - validate http(s) URL (reuse is_valid_clip_url semantics Rust-side)
  - close stale `clip-capture` window if any
  - WebviewWindowBuilder::new(app, "clip-capture", WebviewUrl::External(url))
      .title("Clip capture — solve any challenge, then click Capture")

clip_capture_finish() -> Result<ClipPage, String>
  - window.url() → final_url (post-redirect)
  - with_webview + platform evaluate-JS ("document.documentElement.outerHTML")
      macOS:   WKWebView evaluateJavaScript:completionHandler:
      Windows: ICoreWebView2::ExecuteScript (returns JSON string → decode)
      Linux:   webkit2gtk run_javascript
  - oneshot channel + CAPTURE_TIMEOUT (30 s)
  - close window
  - ClipPage { final_url, html, content_type: "text/html" }

clip_capture_cancel() -> Result<(), String>
  - close window if present
```

`ClipPage` is reused verbatim — capture is a second producer for the same
type, so everything downstream of the fetch is untouched.

Window-closed-by-user detection: `on_window_event(CloseRequested/Destroyed)`
emits a `clip:capture-closed` event so the frontend can dismiss the pending
capture UI.

### Security

- **No IPC for remote content**: the `clip-capture` label must NOT be added
  to `capabilities/default.json` (`main`, `main-*`, `browse-*`, `viewer-*`,
  `pdf-export`, ...). A window without capability grants gets no Tauri IPC,
  so the loaded remote page cannot invoke commands even though it runs in
  our process. This is the core invariant; a test/lint note guards it.
- **Result channel is native, not IPC**: evaluate-JS with completion handler
  returns the string to Rust directly. The remote page never talks to the
  app; the app reads from the page.
- **SSRF posture differs from fetch**: `fetch_checked` blocks private IPs
  because a headless fetch can silently exfiltrate. The capture window is
  user-visible navigation of a user-typed URL — equivalent to a browser, and
  the page's content only enters the vault via explicit user capture. Still,
  reuse `check_ssrf` on the initial URL for consistency (private-IP intranet
  pages are not a clip use case; rejecting keeps one policy).
- **Content sanitization unchanged**: captured HTML flows through the same
  Readability extraction / `sanitize_html` / `html_to_markdown` pipeline as
  fetched HTML. Captured DOM is post-JS (serialized outerHTML), so scripts
  have already run in the isolated window, but none of their code survives
  into any output format.
- **10 MB page cap** applied to the serialized string, mirroring
  `MAX_PAGE_BYTES`.

### Frontend

- `ClipPort` gains:
  ```ts
  capture_start(url: string): Promise<void>;
  capture_finish(): Promise<ClipPage>;
  capture_cancel(): Promise<void>;
  ```
  (adapter → new Tauri commands; mock port for tests).
- `ClipService.clip_page(request)` gains `source: "fetch" | "capture"`
  (default `"fetch"`). `run_clip` picks the page producer; the rest of the
  method is untouched. For `"capture"`, the service awaits
  `capture_finish()` — the start/user-wait/finish choreography lives in the
  action layer, not the service (services never own UI orchestration).
- `clip_actions.ts`:
  - `clip_web_page_confirm` with capture checked → `capture_start`, then
    swap the loading toast for a persistent "Capture page / Cancel" toast
    (or a minimal dialog in `UIStore.clip_capture` state; whichever the
    toast API supports — action buttons on toasts already exist for the
    update flow, verify before choosing).
  - Capture click → `clip_page({ ..., source: "capture" })`.
  - Cancel / window closed (`clip:capture-closed` event) → `capture_cancel`,
    dismiss UI.
  - Fetch failure whose error matches the bot-block message → error toast
    with "Open in capture window" action that re-runs confirm with capture.
    Brittle string-match is avoided by having `clip_fetch_page` return the
    structured error kind: change the Rust error for 403/429 to a stable
    prefix or make `clip_fetch_page` return
    `Result<ClipPage, ClipFetchError>` with `{ kind: "blocked" | "other" }`.
    Structured error is the right call — do that.
- `clip_web_page_dialog.svelte`: "Use browser capture (for sites that block
  automated access)" checkbox wired like the format checkboxes.

### Asset fetches under capture

`clip_fetch_asset` stays the image path even for captured pages. On a
bot-blocking site, image URLs may also 429; the existing graceful path
(remote URL kept, count surfaced in the toast) already handles that.
Capturing image bytes out of the webview (canvas readback) is
CORS-tainted and out of scope. If it matters in practice, the follow-up is
a per-asset capture-window fetch — deferred until someone hits it.

## Decision tree compliance

- New IPC → `ClipPort` extension + `clip_tauri_adapter` (Port + Adapter).
- Capture-pending UI state → `UIStore` (or toast-local if toast actions
  suffice) — component/action concern, not service.
- User-triggerable → action registry (`clip_web_page_confirm` extension +
  capture/cancel actions).
- Async workflow with IO → `ClipService.clip_page` source param.
- Loading/error → existing `clip.page` OpStore key.

## BDD scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Fetch returns blocked error | toast offers capture; choosing it opens window, capture produces outputs identical in shape to fetch path |
| 2 | Dialog "browser capture" checked | skips fetch, goes straight to capture window |
| 3 | User cancels capture | window closed, no outputs, no error toast |
| 4 | User closes window manually | pending UI dismissed, clip aborted cleanly |
| 5 | Capture on invalid/non-http URL | rejected before window opens |
| 6 | Capture times out (page never yields JS result) | error toast, window closed |
| 7 | Captured page > 10 MB | rejected with cap error |
| 8 | Redirected page | final_url reflects post-redirect URL (frontmatter `source` correct) |
| 9 | Capture window has no IPC | `clip-capture` label absent from every capability file (static check) |
| 10 | Image 429 under capture | remote URL kept, failure count in toast (existing behavior) |
| 11 | Structured blocked error | fetch 403/429 → `kind: "blocked"`; 404 → `kind: "other"`, no capture offer |

Frontend scenarios covered by `clip_service.test` / `clip_actions` tests
with a mock port; Rust evaluate-JS plumbing is platform code tested
manually per-OS (same stance as `export/mod.rs` capture).

## Phases

1. **Rust capture commands** (`capture.rs`, macOS evaluate-JS first,
   Windows/Linux behind the same seam) + structured `ClipFetchError`.
2. **Port/adapter/service** `source` param + mock-port tests.
3. **Actions + dialog + pending-capture UI** + blocked-error fallback flow.
4. **Windows/Linux evaluate-JS** parity.

## Non-goals

Browser extension capture, authenticated-session reuse (separate cookie
jar is accepted), automatic capture-on-load heuristics, per-asset webview
fetching, scheduled re-clips, capturing into formats beyond the existing
three.
