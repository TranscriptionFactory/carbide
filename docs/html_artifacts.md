# HTML Artifacts

Carbide treats `.html` files as first-class vault citizens — searchable like notes, embeddable like images, and renderable as fully-interactive artifacts when you opt in. This document covers how the pipeline works end-to-end so you can drop LLM-generated artifacts straight into your vault.

## Render modes: Source / Safe / Live

Every `.html` file opens in one of three modes, picked from the toolbar above the viewer.

| Mode       | What runs                                                                           | Network                 | Default |
| ---------- | ----------------------------------------------------------------------------------- | ----------------------- | ------- |
| **Source** | Nothing — you see the raw markup in the code editor                                 | No                      | —       |
| **Safe**   | Faithful inert preview. Styles and semantic HTML remain; active content is stripped | No                      | ✔       |
| **Live**   | Sandboxed iframe runs scripts. No DOM access to Carbide. Theme vars injected        | No (opt-in: Live + Net) | —       |

Live mode is **default-deny**: clicking Live on an untrusted file opens a "Trust this file?" dialog where you grant Live or Live + Network access at file or folder scope. Grants persist to `<vault>/.carbide/trusted_html.json` and you can revoke them from the same file (or by editing that JSON).

Safe mode preserves document styles, semantic layout, details, media controls,
and presentation SVG while removing scripts, event handlers, active embeds,
navigation-capable forms, and dangerous URL schemes. Local resources resolve
against the HTML file's folder. Remote resources load only with a Live + Network
grant.

Source mode is plain text editing of the underlying file.

All three modes contribute HTML headings to the Outline. Outline selections move
to the source tag in Source mode and to the rendered heading in Safe or Live.
Source mode also participates in Carbide's standard find and replace commands.

Links follow the same routing rules as Markdown: web, mail, and telephone links
open externally; vault-relative links open in Carbide; and fragments navigate
inside the rendered document.

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

## AI editing (Source mode)

The assistant works on `.html` files the same way it works on notes — open the file in **Source** mode, then open the **Assistant** panel (`Cmd/Ctrl+Shift+A`). The document is attached automatically (or via the **This document** button) and the composer offers:

- **Edit** — propose a rewrite of the file. The result arrives as a reviewable proposal; accepting it stages the change into the Source editor's edited buffer and marks the tab dirty. Nothing is written to disk until you save the tab.
- **Ask** — answer a question about the markup without modifying it.

Constraints by design:

- AI is only available in **Source** mode. Safe and Live modes render inside a sandboxed iframe with no editable surface, so there is nothing to apply changes to.
- The operation is always whole-file. Selection-scoped edits aren't supported on HTML in this slice — pick the change you want from the diff view, or refine the prompt.
- Vault context (similar notes, backlinks) is skipped for HTML targets, since backlinks-from-HTML are not extracted yet (see Current limitations).

Accepting the proposal writes through the same buffer the Source editor uses, so undo and the standard save flow behave normally.

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

## Inline HTML embeds

An `html` fenced code block in a markdown note doubles as an embed: Carbide renders the markup in a sandboxed preview attached to the block. (To embed a whole `.html` file instead of inline markup, see Transclusion above.)

````markdown
```html
<p>Hello <strong>inline</strong> artifact.</p>
```
````

- Bare `html` fences render a preview automatically when the note mounts — no extra token needed.
- Opt out per fence by adding the `nopreview` token to the info string:

  ````markdown
  ```html nopreview
  <p>Renders as code, not a preview.</p>
  ```
  ````

  The preview's toggle button persists the same token into the fence meta — toggling a preview off writes `nopreview`, toggling it back on removes it — so a code-first fence survives saving and reopening the note.

- The preview carries a toggle button and a drag handle for resizing.
- `xml`, `css`, and `js` fences stay code-first: they render only when the info string carries the explicit `preview` token, e.g. an `xml` fence whose info string is `xml preview`.
- Previews run under the same locked-down sandbox as Safe mode: `allow-scripts` without `allow-same-origin`, inline scripts and styles only, `connect-src 'none'`. Nothing loads from the network — CDN scripts, fonts, and images fail silently, so author dependency-free markup.

## Starter templates

Carbide ships copy-ready starters (`HTML_EMBED_STARTERS`) for common embeds. Paste one into an `html` fence and edit from there.

### Stat cards

Three KPI cards in a row with an accent edge.

<!-- prettier-ignore-start -->

```html
<style>
  :root {
    --c-bg: var(--carbide-bg, var(--background, #ffffff));
    --c-fg: var(--carbide-fg, var(--foreground, #18181b));
    --c-accent: var(--carbide-accent, var(--primary, #2563eb));
    --c-muted: var(--carbide-muted-fg, var(--muted-foreground, #71717a));
    --c-border: var(--carbide-border, var(--border, #e4e4e7));
  }
</style>
<style>
  .stat-cards .card { flex: 1 1 140px; padding: 12px 16px; border: 1px solid var(--c-border); border-top: 3px solid var(--c-accent); border-radius: var(--radius, 8px); }
  .stat-cards .label { font-size: 0.8rem; opacity: 0.72; }
  .stat-cards .value { margin: 4px 0; font-size: 1.6rem; font-weight: 700; }
</style>
<div class="stat-cards" style="display:flex;gap:12px;flex-wrap:wrap">
  <div class="card">
    <div class="label">Revenue</div>
    <div class="value">$48.2k</div>
    <div class="label">+12% vs last month</div>
  </div>
  <div class="card">
    <div class="label">Active users</div>
    <div class="value">1,284</div>
    <div class="label">+4% vs last month</div>
  </div>
  <div class="card">
    <div class="label">Open tickets</div>
    <div class="value">37</div>
    <div class="label">-9% vs last month</div>
  </div>
</div>
```

<!-- prettier-ignore-end -->

### Bar chart

Inline SVG bar chart themed by chart tokens.

<!-- prettier-ignore-start -->

```html
<style>
  :root {
    --c-bg: var(--carbide-bg, var(--background, #ffffff));
    --c-fg: var(--carbide-fg, var(--foreground, #18181b));
    --c-accent: var(--carbide-accent, var(--primary, #2563eb));
    --c-muted: var(--carbide-muted-fg, var(--muted-foreground, #71717a));
    --c-border: var(--carbide-border, var(--border, #e4e4e7));
  }
</style>
<svg viewBox="0 0 320 168" role="img" aria-label="Bar chart" style="display:block;width:100%;height:auto">
  <line x1="12" y1="140" x2="308" y2="140" style="stroke:var(--c-border)"/>
  <rect x="26" y="96" width="36" height="44" rx="4" style="fill:var(--chart-1, var(--c-accent))"/>
  <text x="44" y="90" text-anchor="middle" style="fill:var(--c-muted);font-size:11px">44</text>
  <rect x="84" y="68" width="36" height="72" rx="4" style="fill:var(--chart-2, var(--c-accent))"/>
  <text x="102" y="62" text-anchor="middle" style="fill:var(--c-muted);font-size:11px">72</text>
  <rect x="142" y="82" width="36" height="58" rx="4" style="fill:var(--chart-3, var(--c-accent))"/>
  <text x="160" y="76" text-anchor="middle" style="fill:var(--c-muted);font-size:11px">58</text>
  <rect x="200" y="44" width="36" height="96" rx="4" style="fill:var(--chart-4, var(--c-accent))"/>
  <text x="218" y="38" text-anchor="middle" style="fill:var(--c-muted);font-size:11px">96</text>
  <rect x="258" y="60" width="36" height="80" rx="4" style="fill:var(--chart-5, var(--c-accent))"/>
  <text x="276" y="54" text-anchor="middle" style="fill:var(--c-muted);font-size:11px">80</text>
  <text x="44" y="156" text-anchor="middle" style="fill:var(--c-muted);font-size:10px">Mon</text>
  <text x="102" y="156" text-anchor="middle" style="fill:var(--c-muted);font-size:10px">Tue</text>
  <text x="160" y="156" text-anchor="middle" style="fill:var(--c-muted);font-size:10px">Wed</text>
  <text x="218" y="156" text-anchor="middle" style="fill:var(--c-muted);font-size:10px">Thu</text>
  <text x="276" y="156" text-anchor="middle" style="fill:var(--c-muted);font-size:10px">Fri</text>
</svg>
```

<!-- prettier-ignore-end -->

### Tabs

Three-tab switcher driven by an inline script.

<!-- prettier-ignore-start -->

```html
<style>
  :root {
    --c-bg: var(--carbide-bg, var(--background, #ffffff));
    --c-fg: var(--carbide-fg, var(--foreground, #18181b));
    --c-accent: var(--carbide-accent, var(--primary, #2563eb));
    --c-muted: var(--carbide-muted-fg, var(--muted-foreground, #71717a));
    --c-border: var(--carbide-border, var(--border, #e4e4e7));
  }
</style>
<style>
  .tabset .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--c-border); }
  .tabset .tab { appearance: none; margin-bottom: -1px; padding: 8px 14px; border: 0; border-bottom: 2px solid transparent; font: inherit; opacity: 0.72; cursor: pointer; }
  .tabset .tab.active { border-bottom-color: var(--c-accent); opacity: 1; font-weight: 600; }
  .tabset .panel { display: none; padding: 12px 2px; }
  .tabset .panel.active { display: block; }
</style>
<div class="tabset">
  <div class="tabs" role="tablist">
    <button class="tab active" data-tab="one">Overview</button>
    <button class="tab" data-tab="two">Details</button>
    <button class="tab" data-tab="three">History</button>
  </div>
  <div class="panel active" data-panel="one">Overview content goes here.</div>
  <div class="panel" data-panel="two">Details content goes here.</div>
  <div class="panel" data-panel="three">History content goes here.</div>
</div>
<script>
(function () {
  var root = document.currentScript.previousElementSibling;
  var tabs = root.querySelectorAll(".tab");
  var panels = root.querySelectorAll(".panel");
  function select(tab) {
    tabs.forEach(function (t) { t.classList.toggle("active", t === tab); });
    panels.forEach(function (p) {
      p.classList.toggle("active", p.dataset.panel === tab.dataset.tab);
    });
  }
  tabs.forEach(function (t) { t.addEventListener("click", function () { select(t); }); });
})();
</script>
```

<!-- prettier-ignore-end -->

### Authoring rules for your own embeds

- **Never hardcode colors.** Open with the token fallback chain so the embed renders themed in fence previews (which inject the shadcn tokens) and in live `.html` artifacts (which inject the `--carbide-*` variables — see Theme variables), and degrades to the literal fallbacks in a plain browser:

  ```html
  <style>
    :root {
      --c-bg: var(--carbide-bg, var(--background, #ffffff));
      --c-fg: var(--carbide-fg, var(--foreground, #18181b));
      --c-accent: var(--carbide-accent, var(--primary, #2563eb));
      --c-muted: var(--carbide-muted-fg, var(--muted-foreground, #71717a));
      --c-border: var(--carbide-border, var(--border, #e4e4e7));
    }
  </style>
  ```

- **Dependency-free only.** No `http(s)://` references — the preview CSP blocks network access silently, so external scripts, fonts, and images never load.
- **Avoid `color:` and `background:` declarations in fence embeds.** Markup that declares its own colors is treated as author-styled and flips the preview to an unthemed neutral surface where the theme tokens are not injected. Theme through borders, `opacity`, and SVG `fill` / `stroke` instead — the starters above do exactly this.

## Current limitations

- No `fetch()` from embedded artifacts (deferred — needs a postMessage RPC bridge for vault reads).
- No JS-rendered text in FTS (intentional — same as code files).
- Backlinks **from** HTML to vault notes are not extracted yet (deferred to a "richer HTML metadata" pass).
- The paste-as-artifact action does not yet prompt for a custom filename. Rename via the file tree after pasting.
- AI editing is whole-file only in Source mode. Inline ghost-text edits (as in the markdown editor) and selection-scoped AI on HTML are not implemented.
