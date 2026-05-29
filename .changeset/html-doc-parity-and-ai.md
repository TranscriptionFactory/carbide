---
"carbide": minor
---

### Features

- **HTML Live mode via `carbide-html:` custom scheme**: Live-mode iframes now load through a dedicated Tauri URI scheme (`src-tauri/src/shared/live_html.rs`) instead of `blob:` or `data:` URLs. The handler resolves trust per request, streams the doc bytes with a tight CSP, and serves vault-relative asset requests (images, fonts, stylesheets sitting next to the HTML file) from the doc's folder. The meta CSP in the served HTML is kept in sync with the response-header CSP so the page works under both. The status bar grew a trust indicator that opens the new Trust panel (`trust_panel_content.svelte`) for revoking per-file / per-folder grants without leaving the editor.

- **Mermaid + KaTeX pre-rendering in HTML Live mode**: `html_live_prerender.ts` walks the HTML AST and pre-renders `<pre><code class="language-mermaid">` blocks and `$…$` / `$$…$$` math nodes server-side, so Live-mode HTML matches markdown rendering even when the doc author did not ship a script tag for either. `mermaid_prerender.ts` runs Mermaid through the existing render path and inlines the SVG; KaTeX is rendered to static HTML with the standard fonts. Both are covered by unit tests in `tests/unit/domain/html_live_prerender.test.ts`.

- **AI assistant + edit dialog now understand HTML documents**: The assistant panel and edit dialog pick up the active HTML document's title, body text, and selection context, so "summarize this", "extract the action items", and inline edit prompts work on HTML files just like markdown notes. `ai_prompt_builder.ts` gained an HTML-aware path; `ai_service`, `ai_actions`, `ai_store`, and the dialog UI route through it. Source-mode AI editing is documented in `docs/html_artifacts.md`.

### Fixes

- **Live-mode iframe lifecycle hardening**: `SandboxedIframe` no longer applies a default `csp` attr (the response-header CSP is authoritative). `drop_guard.ts` ensures Live-mode iframes detach cleanly when the workspace tears down, preventing the lingering window references that surfaced during tab close and panel resize. Covered by `tests/unit/utils/drop_guard.test.ts`.

- **Live-mode CSP alignment**: The meta CSP injected into served HTML now mirrors the `live_html.rs` response-header CSP exactly, so DOM-level resource loads (images, fonts) succeed under the same policy that the browser enforces from the header.

### Notes

- Includes the `2026-05-29_html_doc_parity_plan.md` planning doc that scoped the mermaid / KaTeX / asset-resolution work, plus a lint + format pass over the HTML parity changes.
