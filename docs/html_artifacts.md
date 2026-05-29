# HTML Artifacts

Carbide treats `.html` files as first-class vault citizens — searchable like notes, embeddable like images, and renderable as fully-interactive artifacts when you opt in. This document covers how the pipeline works end-to-end so you can drop LLM-generated artifacts straight into your vault.

## Render modes: Source / Safe / Live

Every `.html` file opens in one of three modes, picked from the toolbar above the viewer.

| Mode       | What runs                                                                    | Network                 | Default |
| ---------- | ---------------------------------------------------------------------------- | ----------------------- | ------- |
| **Source** | Nothing — you see the raw markup in the code editor                          | No                      | —       |
| **Safe**   | Sanitized static preview. Scripts and inline event handlers are stripped     | No                      | ✔       |
| **Live**   | Sandboxed iframe runs scripts. No DOM access to Carbide. Theme vars injected | No (opt-in: Live + Net) | —       |

Live mode is **default-deny**: clicking Live on an untrusted file opens a "Trust this file?" dialog where you grant Live or Live + Network access at file or folder scope. Grants persist to `<vault>/.carbide/trusted_html.json` and you can revoke them from the same file (or by editing that JSON).

Source mode is plain text editing of the underlying file.

## Transclusion: `![[file.html]]`

You can embed an artifact directly in a markdown note:

```markdown
![[chart.html]]
```

The renderer:

- Always uses **Safe** mode for embeds (regardless of the file's trust grant). Embeds are passive previews — use the "Open in tab" button on the embed toolbar to see Live output.
- Honours optional `#k=v` fragment parameters, e.g. `![[chart.html#height=240&data=sales.csv]]`. The reserved keys `page` and `height` configure the embed; any other key passes through to the artifact (consumable by Live-mode renderers in future phases).
- Rewrites vault-relative `src=` / `href=` / `poster=` references inside the embedded HTML so images stored next to the artifact resolve correctly. Absolute URLs (`http(s):`, `//`, `data:`, `blob:`, `mailto:`, `tel:`, `#anchor`) are left untouched.
- Does **not** run `fetch()` from inside the embedded sandbox. Static asset references work; dynamic vault reads are deferred to a future vault-RPC phase.

## Paste-from-clipboard as artifact

When an LLM hands you a complete HTML page, drop it into the vault in one step:

1. Copy the HTML to your clipboard (e.g. from a chat response).
2. Run the **Paste Clipboard HTML as Artifact** action from the command palette (`document.paste_html_artifact`).
3. Carbide writes a new file in the current note's folder (filename derived from the `<title>` slug + timestamp; falls back to `pasted-html-<timestamp>.html` when no title is present) and inserts `![[<name>.html]]` at the cursor.
4. A sidecar file `<name>.html.meta.json` records the provenance:

   ```json
   {
     "source": "clipboard",
     "pasted_at": "2026-05-29T12:34:56.000Z"
   }
   ```

The sidecar schema is intentionally minimal — `source` is required, `pasted_at` is recommended, and any extra fields you add are preserved.

## Provenance banner

Opening an `.html` file with a sidecar `.meta.json` shows a banner above the renderer (e.g. _"Pasted from clipboard on 2026-05-29"_). The banner exposes a small ✕ button that runs the **Clear HTML Artifact Provenance** action (`document.clear_provenance`), which deletes the sidecar and removes the banner.

## Theme variables (Live mode)

Live-mode renders inject Carbide theme variables into the iframe `<head>`, so artifacts can blend with the surrounding app:

| Variable              | What it maps to                |
| --------------------- | ------------------------------ |
| `--carbide-bg`        | Document background colour     |
| `--carbide-fg`        | Foreground text colour         |
| `--carbide-muted-fg`  | Secondary text colour          |
| `--carbide-border`    | Border / divider colour        |
| `--carbide-accent`    | Primary accent (links, focus)  |
| `--carbide-accent-fg` | Text colour on accent surfaces |
| `--carbide-link`      | Link colour                    |
| `--carbide-code-bg`   | Code-block background          |
| `--carbide-code-fg`   | Code-block foreground          |
| `--carbide-font-sans` | Sans-serif font stack          |
| `--carbide-font-mono` | Monospace font stack           |
| `--carbide-scheme`    | `light` or `dark`              |

The block also sets `color-scheme: light | dark` on `:root`. Artifacts that ignore the variables render unchanged; artifacts that opt in (`color: var(--carbide-fg)`) follow the user's theme.

## Indexing and search

- FTS indexes the **stripped HTML body text** (visible text content, skipping `<script>`, `<style>`, `<noscript>`, `<template>`) and the `<title>` element (falling back to the first `<h1>`).
- JS-rendered text is **not** searchable — Carbide does not execute artifacts at index time. If a chart's labels only appear after script execution, they will not appear in search results.
- Markdown links of the form `[label](file.html)` resolve as attachments, so HTML artifacts participate in backlinks like any other attachment.

## Security model

- A single iframe envelope governs every sandboxed render (Safe preview, transclusion embed, Live mode). Sandbox is `allow-scripts` only, no `allow-same-origin`. The default CSP forbids network access and limits asset loading to `data:`, `blob:`, and `carbide-asset:` for the resolver.
- The "Live + Network" grant opens up `connect-src *`; everything else stays locked.
- No grant ever exposes `parent.window`, `parent.document`, or the rest of Carbide's runtime to the artifact.

## Current limitations

- No `fetch()` from embedded artifacts (deferred — needs a postMessage RPC bridge for vault reads).
- No JS-rendered text in FTS (intentional — same as code files).
- Backlinks **from** HTML to vault notes are not extracted yet (deferred to a "richer HTML metadata" pass).
- The paste-as-artifact action does not yet prompt for a custom filename. Rename via the file tree after pasting.
