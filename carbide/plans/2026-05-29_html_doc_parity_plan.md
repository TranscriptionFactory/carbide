# HTML Document Parity Plan

**Date:** 2026-05-29
**Scope:** Bring HTML documents to feature parity with markdown for the highest-impact rendering paths, and resolve a CSP inconsistency surfaced during the audit.

## Current state inventory

| Layer | Component |
|---|---|
| Live preview | `src/lib/features/document/ui/html_live_renderer.svelte` + `src-tauri/src/shared/live_html.rs` (custom `carbide-html:` scheme, sandboxed iframe, CSP, theme injection, network gate) |
| Read-only preview | `src/lib/features/document/ui/html_viewer.svelte` (sanitized `srcdoc` iframe) |
| Trust | `trusted_html_tauri_adapter` + `trusted_html_dialog` + `trust_panel_content` |
| Conversion | `src/lib/shared/html/html_to_markdown.ts` |
| Paste pipeline | `src/lib/features/document/domain/html_artifact_paste.ts` |
| Theming | `src/lib/features/document/domain/html_theme_vars.ts` |
| Math assets | `src/lib/features/document/domain/katex_inline_css.ts` (only wired into markdown→PDF) |
| AI | AI assistant + edit dialog handle HTML docs (commit `6f2274a7`) |

## Gap audit

### Tier 1 — markdown parity (this plan)

1. **Mermaid auto-render in HTML Live.** `note_html.ts::prerender_mermaid` already renders fenced mermaid to inline SVG for markdown→PDF. HTML docs get nothing — `<pre class="mermaid">` (or any agreed marker) renders as raw text.
2. **KaTeX auto-render in HTML Live.** `katex_inline_css.ts` exists but is only consumed by the markdown export path. Math in an HTML doc is plain `$...$`.
3. **Local asset resolution.** `<img src="./assets/foo.png">` and vault-relative anchors 404 against the `carbide-html://<token>/` origin because the protocol handler only knows about the registered HTML body, not the doc's parent folder.

### Tier 2 — HTML doc UX (deferred)

- Markdown → HTML doc conversion (the reverse of `html_to_markdown`).
- Live reload on Source-mode edits (verify keystroke debounce).
- Iframe console / error surfacing via `postMessage` bridge.
- Outline / heading navigation.
- Diff view for AI edits (trust + reviewability).

### Tier 3 — workflow (deferred)

- PDF export from HTML doc.
- Self-contained export with inlined assets.
- Template gallery.
- External-link interception (verify `target="_blank"` behavior under `sandbox="allow-scripts"`).

### Wikilinks and code-block syntax highlighting

Flagged in the audit but **deferred**. Wikilinks require deciding whether HTML docs participate in the backlink graph (product question, not a bug). Shiki pre-highlighting is straightforward but not urgent — most users writing HTML directly are already styling their own code blocks.

## CSP inconsistency — resolution

Both `build_live_csp` (TS meta) and `live_html_csp` (Rust response header) were last touched in commit `c8f41505`. That commit *introduced* `live_html.rs` (the new transport layer); the TS meta is legacy carried forward. The Rust header is the newer architectural source of truth.

The Rust header is **strictly more permissive** than the TS meta:

| Directive | TS meta | Rust header |
|---|---|---|
| `script-src` | `'unsafe-inline' 'unsafe-eval'` | `'unsafe-inline' 'unsafe-eval' blob: data:` |
| `style-src` | `'unsafe-inline'` | `'unsafe-inline' data:` |
| `img-src` | `data: blob:` (+ `https: http:` if `allow_network`) | `data: blob: https: http:` always |
| `font-src` | `data:` (+ `https: http:` if `allow_network`) | `data: https: http:` always |
| `media-src` | `data: blob:` (+ `https: http:` if `allow_network`) | `data: blob: https: http:` always |
| `connect-src` | `'none'` or `*` per `allow_network` | `*` always |
| `frame-src` | (absent) | `data: blob:` |

Browsers intersect multiple CSPs, so the TS meta silently overrides anything the Rust header advertises. User scripts that legitimately use `URL.createObjectURL(new Blob([js], {type:'text/javascript'}))` for Workers, data-URL stylesheets, or nested `<iframe srcdoc>` are blocked today.

**Decision: align the TS meta to the Rust header, keeping `connect-src` as the sole per-doc `allow_network` gate.**

**Does this break interactive HTML functionality?** No — it *unblocks* interactivity. We are relaxing the intersection, not tightening it. The only behavioral change is that patterns previously killed by the meta CSP will start working. The `allow_network` gate continues to enforce the only meaningful per-doc policy: whether the document can reach the network at all (`connect-src`).

Follow-up: consider also moving `connect-src` per-doc control into the Rust handler (so the response header itself differs by doc state). Not in scope for this plan.

## Implementation

### 1. CSP unification (Task #2)

- File: `src/lib/features/document/domain/html_live_document.ts`
- Update `build_live_csp` to mirror `live_html_csp()`:
  - `script-src 'unsafe-inline' 'unsafe-eval' blob: data:`
  - `style-src 'unsafe-inline' data:`
  - `img-src data: blob: https: http:`
  - `font-src data: https: http:`
  - `media-src data: blob: https: http:`
  - `frame-src data: blob:`
  - `connect-src 'none' | *` per `allow_network` (unchanged)
- Update existing unit tests to match (`tests/` — locate via grep for `build_live_csp`).

### 2. Mermaid auto-render (Task #3)

- Extract `prerender_mermaid` and `collect_mermaid_codes` from `note_html.ts` into a shared module: `src/lib/features/document/domain/mermaid_prerender.ts`. Re-export from `note_html.ts` to avoid breaking that path.
- In `build_live_html_document`, accept an optional `mermaid_svgs: Map<string, string>` and replace `<pre class="mermaid">…</pre>` (or `<code class="language-mermaid">`) blocks with `<figure class="mermaid-figure">…SVG…</figure>`.
- Caller (`html_live_renderer.svelte`) calls the prerender step before invoking `html_live_register`. Async; show a brief loading state.
- Tests: `tests/unit/domain/html_live_document.test.ts` (new) — asserts mermaid blocks are replaced when SVGs are provided.

### 3. KaTeX auto-render (Task #4)

- Add a `prerender_math` helper in the same domain module (or a sibling `katex_prerender.ts`). Reuse `katex_inline_css.ts` for the style block.
- Scan the body for `$$…$$` (display) and `$…$` (inline). For HTML docs we cannot trust markdown tokenization; use a conservative regex with the same escape rules as `note_html.ts`'s math handling (verify by reading current implementation).
- Inject KaTeX-rendered HTML in place; inject the KaTeX CSS via the `theme_style` parameter (or a new `extra_style` slot) so `build_live_html_document` doesn't grow new params unnecessarily.
- Tests: extend `html_live_document.test.ts` with math-rendering cases.

### 4. Local asset resolution (Task #5)

- Approach: extend `handle_live_html_request` in `live_html.rs`. When the request URI's path is `/` (or empty), serve the registered HTML body as today. When it has a non-empty sub-path, look up the doc's registered parent folder and stream the requested file (with normal traversal guards — no `..`, no symlinks outside the folder).
- Register-time change: `html_live_register` must accept an optional vault folder path alongside the HTML and persist it in `LiveHtmlStore`.
- Caller change: `html_live_renderer.svelte` passes the current document's folder when invoking `html_live_register`.
- Path rewriting on the HTML body is not required if the doc origin is `carbide-html://<token>/` — relative paths resolve naturally against that base.
- Tests: extend Rust tests in `src-tauri/src/tests/` (look for the existing `csp_response_header_is_present` test as a sibling). Cases: served sub-path, path traversal rejected, missing file returns 404.

## Risks and open questions

- **Mermaid bundle weight in HTML Live.** Prerender happens at the calling layer (TS), so the existing dynamic import already keeps it off the initial bundle. The HTML live renderer now incurs a one-time cost when a doc contains mermaid. Acceptable.
- **KaTeX regex correctness.** Inline math detection in raw HTML is messier than in markdown. If unreliable, fall back to requiring an explicit wrapper like `<span class="math">$…$</span>`. Decide during implementation.
- **Asset resolution origin.** Confirm `carbide-html://<token>/` resolves relative paths as expected; if browsers strip the token, may need to serve from `carbide-html://<token>.local/` or similar. Verify before committing to the URL-based approach.
- **CSP unification tests.** Existing tests assert the *exact* CSP string. They will all need updates — that's fine, but flag it as part of the diff.

## Success criteria

- [ ] Plan doc committed.
- [ ] CSP intersection no longer silently restricts the Rust header. Unit tests assert the merged CSP allows `blob:`/`data:` for `script-src` and the `frame-src` directive is present.
- [ ] Mermaid block in an HTML doc renders as SVG in Live mode (manual verify + unit test).
- [ ] `$$ \int x\,dx $$` in an HTML doc renders via KaTeX (manual verify + unit test).
- [ ] `<img src="./logo.png">` resolves against the doc's folder in Live mode (manual verify + Rust test for `handle_live_html_request` sub-path serving).
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo check`, `pnpm format` clean.

## Out of scope (explicitly)

- Tier 2 and Tier 3 items above.
- Removing the mermaid pan/zoom/fullscreen/export chrome in `code_block_view_plugin.ts` (separate discussion).
- Wikilink graph participation for HTML docs.
- Shiki pre-highlighting inside HTML Live.
