# Implementation Plan — HTML / LLM Artifacts as First-Class Vault Citizens

**Date:** 2026-05-29
**Motivation:** HTML pages have become a natural medium for LLMs to communicate ideas — interactive, information-dense, self-contained. Carbide already renders `.html` files as sanitized previews, but the surrounding ecosystem (indexing, graph, transclusion, security model, authoring) treats them as second-class. This plan closes that gap so HTML artifacts compose into notes the same way images and code blocks do, and so LLM-generated artifacts have a coherent capture/render/edit story.

**Prior-art sanity check:** Obsidian has the inverse problem — raw inline HTML is on by default (with known pain points), but `.html` files require third-party plugins to render, and there is no first-class LLM artifact concept anywhere in the ecosystem. The top-ranked unfulfilled Obsidian feature request (`![[file.html]]` transclusion) is exactly what we are building here. Our security model (sandboxed iframe, no `allow-same-origin`, CSP-blocked network) matches what the community has converged on independently.

---

## Cross-cutting concerns (call out once, reuse below)

- **Single iframe security envelope.** All sandboxed HTML rendering (preview, transclusion, future plugins) reuses one config: `sandbox="allow-scripts"`, no `allow-same-origin`, CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'`. Network access is opt-in per trust grant. Existing `src/lib/shared/ui/sandboxed_iframe.svelte` is the canonical primitive; `html_viewer.svelte` and the future embed renderer wrap it with different presets, not different security policies.
- **Trust model.** Three levels per `.html` file: `safe` (default — sanitized static render, no JS), `live` (sandboxed JS, no network), `live+net` (sandboxed JS, network allowed). Grant is per-file or per-folder, persisted in vault settings (`.carbide/trusted_html.json`). Default-deny — a casual user never gets a security prompt unless they explicitly opt in.
- **We index source, not runtime.** HTML body indexed for FTS is the parsed-and-stripped source. JS-rendered text is not searchable. This is a conscious decision, same as code files; do not try to run JS at index time.
- **Theme inheritance.** Sandboxed renders inherit Carbide's color scheme by injecting CSS variables into the iframe via query string (`?theme=dark&fg=...&bg=...`). Artifacts that ignore them render unchanged; artifacts that honor them blend in. No postMessage required for theming — query string keeps it static and cacheable.
- **Provenance is metadata, not a file format.** Artifact origin (clipboard paste, model, chat ID, prompt snippet) lives in a sidecar `.html.meta.json` next to the file, NOT in the HTML itself. Keeps the HTML directly openable in any browser and avoids polluting LLM output with framework headers.

---

## Phase 0 — HTML reaches parity with PDFs (foundation) ✅

These are the cleanup gaps identified during planning. Without them, every later phase has to work around half-supported HTML. None of these introduces new UX surface — they finish the existing pipeline.

**Status (2026-05-29):** Implemented and verified.
- P0.1 ✅ — `FileCategory::Html` variant added; `"html" | "htm"` moved out of the `Code` arm; `as_str()` returns `"html"`; classification test added.
- P0.2 ✅ — `scraper = "0.27"` added; new `html_extractor` module with `extract_html_text(bytes) -> {title, body}`; chardet decode + DOM walk that skips `<script>`/`<style>`/`<noscript>`/`<template>` and inserts separators around block tags; wired into `extract_content`'s `Html` branch and `index_single_file_from_disk` (extracted `<title>` / first `<h1>` flows into `meta.title`). `ExtractedContent` gained an optional `title` field. Seven unit tests cover title extraction, tag stripping, script/style/noscript skipping, block-tag separation, and the empty-input case.
- P0.3 ✅ — `html|htm` appended to `ATTACHMENT_EXT_RE` (TS) and `ATTACHMENT_EXTENSIONS` (Rust). Unit tests on both sides assert `.html`/`.htm` classify as attachments, not outlinks.
- P0.4 ✅ — Decision reaffirmed in code: backlinks FROM html are deferred to Phase 4 (no code change).

**Verification:**
- `cargo check` — clean (only pre-existing warnings).
- `cargo test --lib features::search::text_extractor` — 18 passed, including the new `classify_html_extensions` test.
- `cargo test --lib features::search::html_extractor::` — 7 passed (all new tests).
- `cargo test --lib features::search::db::tests::is_attachment_target_recognizes_html` — passed.
- `pnpm test` — 3868 / 3868 pass, including the new HTML-as-attachment cases.
- `pnpm check` — 0 errors (3 warnings, pre-existing in `image_alt_editor.svelte`).
- `pnpm lint` — fails on **one pre-existing, unrelated** layering violation in `src/lib/features/note/application/note_actions.ts:38` (introduced by `fbf3accc`); not caused by this phase.
- `pnpm format` — clean (no diffs to write).

### P0.1 — Split `FileCategory::Html` from `Code`

**Scope:** Give HTML its own category in the indexer so we can route extraction and metadata differently.

**Approach:**
1. In `src-tauri/src/features/search/text_extractor.rs`, add `FileCategory::Html` variant; move `"html" | "htm"` from the `Code` match arm to a dedicated arm.
2. `extract_content` gets an `Html` branch that calls a new `extract_html_text(bytes)` (see P0.2).
3. Update `as_str()` to return `"html"`.

**Acceptance:**
- `.html` files in the index report `file_type = "html"` (was `"code"`).
- All existing `classify_file` tests still pass; new test asserts HTML classification.

**Risk:** low. Existing `Code`-category consumers (just the indexer) don't inspect the category beyond `as_str()`.

---

### P0.2 — Strip HTML tags before FTS indexing

**Scope:** Stop indexing markup noise (class names, inline JS tokens). Index visible text.

**Approach:**
1. Add `scraper` (or `html5ever` directly) to `src-tauri/Cargo.toml`.
2. New module `src-tauri/src/features/search/html_extractor.rs` with `extract_html_text(bytes) -> (title, body)`:
   - Decode bytes via `chardetng` (reuse `decode_text_body`'s detector).
   - Parse DOM; extract `<title>` (or first `<h1>`) for title; walk visible text nodes for body, skipping `<script>`, `<style>`, `<noscript>`.
   - Truncate to `MAX_INDEXABLE_BYTES`.
3. `extract_content` `Html` branch calls this; title flows into `meta.title`, body into `notes_fts.body`.

**Acceptance:**
- FTS search for a class name appearing only in markup (e.g., `bg-blue-500`) returns no HTML results.
- FTS search for visible text appearing in `<p>` returns the HTML file.
- Title-extraction test: file with `<title>Dashboard</title>` indexes with `title = "Dashboard"`.

**Risk:** medium. Pulls in a real HTML parser. Mitigation: same crate already used elsewhere via dependency closure (`selectors` shows in build output); marginal binary-size cost.

---

### P0.3 — Add `.html`/`.htm` to attachment lists

**Scope:** Make markdown-to-html links resolve correctly.

**Approach:**
1. `src/lib/features/links/domain/extract_local_links.ts:14` — add `html|htm` to `ATTACHMENT_EXT_RE`.
2. `src-tauri/src/features/search/db.rs:1820` — add `".html", ".htm"` to `ATTACHMENT_EXTENSIONS`.
3. Add a unit test on each side: `[chart](page.html)` classifies as attachment, not outlink.

**Acceptance:**
- Markdown link `[foo](bar.html)` appears in `attachment_paths`, not `outlink_paths`.
- No phantom orphan edges in graph view for HTML-targeted links.

**Risk:** trivial. Two regex additions.

---

### P0.4 — Backlinks FROM html (defer decision)

**Scope:** Should an HTML artifact's `<a href="some-note.md">` create a graph edge into that note?

**Decision:** **Defer to Phase 4.** PDFs have the same blind spot and we accept it; doing this for HTML means writing a separate link-extractor that runs at index time. Worth doing eventually (HTML dashboards that link to source notes are higher-value than PDF citations), but not on the critical path for the artifact use case. Revisit after Phase 2 lands and we have real artifacts to test against.

---

## Phase 1 — Render modes: Source / Safe / Live

The current `html_view_mode` is a binary `source | visual` toggle. Expand to three modes, with the third (Live) being the one that makes LLM artifacts actually work.

### P1.1 — Three-state render mode

**Scope:** Replace the boolean toggle with `source | safe | live` enum.

**Approach:**
1. `src/lib/features/document/state/document_store.svelte.ts` — change `html_view_mode: "source" | "visual"` to `"source" | "safe" | "live"`. Default to `safe` (current behavior).
2. `src/lib/features/document/ui/document_viewer_content.svelte:42` — replace `toggle_html_view_mode` with a 3-segment toggle. Live segment is disabled unless the file (or its folder) has a trust grant.
3. Persist the chosen mode per-file in document state (currently per-tab; carry forward).

**Acceptance:**
- Existing notes preserved: any file currently rendering shows `safe` after the change.
- Clicking Live without a trust grant shows a "Trust this file?" / "Trust folder?" dialog; clicking either grants and switches mode.
- Source mode unchanged from today.

**Risk:** low. The toggle UI already exists; this expands its states.

---

### P1.2 — Live render via sandboxed iframe

**Scope:** Render unsanitized HTML with JS, isolated from Carbide and the vault.

**Approach:**
1. New component `src/lib/features/document/ui/html_live_renderer.svelte` wrapping `sandboxed_iframe.svelte`. Props: `content` (raw HTML string), `theme`, `allow_network` (bool, default false).
2. Iframe `srcdoc` injects:
   - `<meta http-equiv="Content-Security-Policy" content="...">` matching the trust grant (no `connect-src` when network disabled).
   - A `<style>` block exposing Carbide theme variables (`--carbide-fg`, `--carbide-bg`, etc.) at `:root`. Artifacts opt in by using these vars; default-styled artifacts render unchanged.
3. `document_viewer_content.svelte` routes Live mode to this component, Safe mode to existing `html_viewer.svelte`.

**Acceptance:**
- A test fixture with a working `<canvas>` + `<script>` animation renders and animates in Live mode.
- The same file in Safe mode shows static fallback (no animation).
- An artifact attempting `fetch("https://example.com")` fails when `allow_network=false`; succeeds when granted (verified via DevTools console).
- Iframe cannot access `parent.document` (verified: throws `SecurityError`).

**Risk:** medium. Browser sandbox semantics around `srcdoc` + CSP have edge cases. Mitigation: add Vitest tests that inject known-bad HTML (top-level navigation attempt, `document.cookie` access, parent access) and verify the sandbox blocks each.

---

### P1.3 — Trust grants (per-file, per-folder)

**Scope:** Persist user decisions about which HTML files may run scripts.

**Approach:**
1. New port `TrustedHtmlPort` in `src/lib/features/document/ports.ts` with `is_trusted(path)`, `grant_file(path, level)`, `grant_folder(path, level)`, `revoke(path)`.
2. Tauri adapter persists to `<vault>/.carbide/trusted_html.json` (existing `.carbide` config dir convention).
3. UI: trust dialog (Phase 1.1) + settings panel section "Trusted HTML files" with revoke buttons.
4. Trust level enum: `safe` (default, no grant needed), `live`, `live+net`.

**Acceptance:**
- Granting a folder propagates to new HTML files added to that folder.
- Revoking returns the file to Safe mode immediately (any open Live render reloads).
- `.carbide/trusted_html.json` is human-readable and editable.

**Risk:** low. Same persistence pattern as existing vault settings.

---

### P1.4 — Theme variable injection

**Scope:** Live artifacts that use Carbide tokens look native.

**Approach:**
1. In `html_live_renderer.svelte`, prepend an injected `<style>:root { --carbide-fg: ...; --carbide-bg: ...; ... }</style>` to the iframe `srcdoc`. Source the values from `stores.ui.active_theme`.
2. Document the available variables in `docs/html_artifacts.md` (new file in Phase 3.3).
3. No JS bridge required — purely CSS, refresh-on-theme-change handled by Svelte reactivity re-rendering the iframe.

**Acceptance:**
- A test fixture using `color: var(--carbide-fg, black)` matches the surrounding app on both light and dark themes.
- A fixture not using the variables renders identically to before (no regression).

**Risk:** trivial.

---

## Phase 2 — Transclusion: `![[file.html]]` in markdown

The synergy point. Notes stay readable markdown; HTML artifacts become composable blocks.

### P2.1 — Route `.html` through the file-embed pipeline

**Scope:** Make `![[chart.html]]` render an embedded sandboxed iframe inside a note.

**Approach:**
1. `src/lib/features/editor/adapters/file_embed_plugin.ts:30` — extend `detect_embed_type` to return `"html"` for `.html`/`.htm`.
2. Confirm `EXCLUDED_EXTENSIONS` (line 24) doesn't block it (it doesn't — currently only `md`, `canvas`, `excalidraw`).
3. `file_embed_view_plugin.ts` — add `case "html"` in the NodeView that instantiates a sandboxed iframe with the embed's height. Reuse `html_live_renderer.svelte`'s render path via a dynamic Svelte mount, or build a vanilla-JS equivalent if Svelte-in-PM is awkward (check existing `note_embed_view_plugin.ts` for pattern).
4. Default the embed to **Safe** mode regardless of file-level trust — embeds are passive previews; user explicitly opens the file to get Live mode.

**Acceptance:**
- A note containing `![[chart.html]]` renders the artifact inline at the specified height.
- Default embed is sanitized (no JS); a small "Open in tab for live view" affordance is present.
- Backlinks: the note containing the embed appears in the HTML file's backlinks panel (rides on P0.3).

**Risk:** medium. PM NodeView mounting Svelte-host iframes has prior art in Excalidraw/canvas embeds (`excalidraw_embed_view_plugin.ts`); mirror that.

---

### P2.2 — Embed parameter passing via fragment

**Scope:** Allow parameterized artifacts — `![[chart.html#data=sales.csv&theme=dark]]`.

**Approach:**
1. `parse_embed_fragment` in `file_embed_plugin.ts:39` already extracts query-string-style fragments; extend it to pass arbitrary key/value pairs through to the iframe `src`.
2. Artifact reads `URLSearchParams(window.location.search)` to consume them.
3. No new RPC; query string only. Vault-file references (`data=sales.csv`) get resolved by Carbide to data URIs / asset URLs at embed-render time — see P2.3.

**Acceptance:**
- An embed with `#height=200` renders at 200px (existing).
- An embed with `#title=Hello` sets a fixture artifact's text to "Hello".
- Vault-path params (`#data=sales.csv`) are resolved through the existing asset URL resolver and arrive at the iframe as URLs the artifact can `fetch()` (network grant required for vault asset fetch from inside the sandbox — likely not for v1; defer to vault-RPC phase).

**Risk:** low. Existing fragment plumbing extends naturally.

---

### P2.3 — Asset resolution from sandboxed embeds

**Scope:** An embedded artifact can reference vault images / data files.

**Decision:** **In-scope only for static references (`<img src="...">`) via `srcdoc` URL rewriting; defer dynamic `fetch()` to Phase 4.** Reason: `fetch()` from inside the sandbox requires either `allow-same-origin` (security regression) or a postMessage RPC bridge (new surface area). Static rewriting covers the common case (charts referencing images) without opening either.

**Approach:**
1. Before injecting `srcdoc`, regex-rewrite `src="some/path.png"` to the corresponding asset URL the same way `note_html.ts:rewrite_wiki_image_embeds` does for note rendering.
2. Document the limitation in `docs/html_artifacts.md`.

**Acceptance:** Static-image references in an embedded artifact render. `fetch()` calls fail (documented).

**Risk:** low.

---

## Phase 3 — LLM workflow: paste capture + provenance

These turn the feature from "view your own HTML files" into "the natural place to keep LLM artifacts."

### P3.1 — Paste-from-clipboard as artifact

**Scope:** Detect HTML in the clipboard; offer to save as an artifact and insert a transclusion.

**Approach:**
1. Add a new action `html.paste_as_artifact` in `src/lib/features/document/application/document_actions.ts` (or a new `html_actions.ts` if it grows).
2. Action reads clipboard (`navigator.clipboard.read()` → `text/html`); if present and looks like a full document (`<!doctype`, `<html`), prompt for filename (default: derived from `<title>` slug), write to current folder, insert `![[<name>.html]]` at cursor.
3. Also generate a sidecar `<name>.html.meta.json` capturing: `source: "clipboard"`, `pasted_at`, optional user-entered tag for the source model/chat.
4. Add a hotkey suggestion (`Cmd+Shift+V`?) — defer binding to user.

**Acceptance:**
- Copy an LLM-generated HTML response, hit the action, get an artifact file + transclusion inserted in one step.
- Sidecar metadata is created and persisted.
- If clipboard contains plain text, action no-ops with a notice.

**Risk:** medium. Clipboard API permissions vary on macOS/Tauri webview; verify the read works without prompting per-paste.

---

### P3.2 — Provenance metadata + display

**Scope:** Surface artifact origin in the UI.

**Approach:**
1. When viewing a `.html` file with a sidecar `.meta.json`, show a small banner above the renderer: "Pasted from clipboard on 2026-05-29" (or whatever metadata exists).
2. Provide an action to edit/clear metadata.
3. Sidecar schema kept minimal — extensible map, no required fields beyond `source`.

**Acceptance:**
- Banner displays for files with sidecar metadata.
- No banner / no error for files without.

**Risk:** trivial.

---

### P3.3 — Documentation

**Scope:** New doc `docs/html_artifacts.md` covering: trust model, the three view modes, transclusion syntax, available theme variables, current limitations (no JS-rendered text in FTS, no `fetch()` from embeds).

**Acceptance:** Doc exists, linked from `docs/getting_started.md` or wherever attachment-handling is documented.

**Risk:** none.

---

## Phase 4 — Deferred (intentional)

Captured here so the scope creep is explicit. Do NOT bundle into the initial implementation.

- **Vault-RPC for artifacts.** Restricted read-only RPC (list folder, FTS query, read note) over postMessage, plugin-style but narrower. Enables live dashboards. Requires a security review of the API surface; significant work.
- **Persistent artifact state.** Form values / slider positions saved to sidecar `.state.json` or scoped localStorage. Unlocks habit trackers, parameter explorers, decision logs.
- **Artifact templates.** Curated library of blank canvases LLMs can fill (kanban, chart, comparison table).
- **Snapshot-to-image fallback.** For PDF export — render Live artifact, capture screenshot, embed in PDF.
- **Side-by-side authoring.** Source-left + live-preview-right with auto-refresh. Mostly UI work; could pair with the existing source/visual toggle and ProseMirror split-view code.
- **Backlinks extracted from HTML source** (was P0.4). Cheaper than vault-RPC but worth bundling with a future "richer HTML metadata" pass.
- **Round-trip to chat** (open artifact source in Claude/Codex plugin for revision). Requires LLM-plugin integration that doesn't exist yet.

---

## Sequencing & dependencies

```
Phase 0 (all parallelizable, no inter-deps) ─┐
                                             ▼
Phase 1.1 (mode enum) ─┬─► 1.2 (live render) ─► 1.3 (trust grants) ─► 1.4 (theme)
                       │                                                │
                       └────────────────────────────────────────────────┘
                                             ▼
Phase 2.1 (transclusion route) ──► 2.2 (params) ──► 2.3 (asset rewriting)
                                             ▼
Phase 3.1 (paste capture) ──► 3.2 (provenance UI) ──► 3.3 (docs)
```

Phase 0 is mostly mechanical and can land independently — recommended as its own PR to unblock everything else cleanly. Phases 1 and 2 are the substance; each is one PR. Phase 3 is one more PR. Total: ~4 PRs.

## Verification checklist (per PR, per AGENTS.md)

- `pnpm check` — Svelte/TypeScript type checking
- `pnpm lint` — oxlint + layering rules
- `pnpm test` — Vitest
- `cd src-tauri && cargo check`
- `pnpm format`
- Manual: render a known-good interactive HTML artifact in Live mode; verify network blocked by default; verify embed in markdown note renders; verify sandbox blocks parent access.
