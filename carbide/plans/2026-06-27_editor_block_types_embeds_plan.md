# Plan: Editor block types & embeds (#3) — deferred follow-up to capability upgrades

## Status

**Implemented (2026-06-27)** on branch `feat/editor-capability-upgrades`, following the
build sequence below. This is item **#3** of the open-knowledge → Carbide editor port;
item **#4 (capability upgrades)** shipped earlier the same day.

Commits:

- `feat(editor): carry code-block fence meta through markdown round-trip` (3a meta attr)
- `feat(editor): web_embed + video nodes with lossless HTML round-trip` (3b serialization)
- `feat(editor): live HTML/CSS/JS preview pane for code blocks` (3a preview)
- `feat(editor): in-editor conversion of typed/pasted iframe & video blocks` (3b authoring)

Deferred polish: 8-point resize handles on the embed/video NodeView (nodes already render
via schema `toDOM`; `<video>` exposes native controls, so step 3's "renders / controls"
gate is met — only drag-resize remains).

This document preserves the **serialization decision** agreed during #4 planning so it is
not lost, and records the as-built build sequence.

## Scope

Port new **block types / external-media embeds** from the open-knowledge donor (TipTap +
React, MDX-backed; read-only at
`/home/avocado/src/open-knowledge/packages/app/src/editor/`) into Carbide's editor (raw
ProseMirror + Svelte 5, markdown-on-disk via remark/mdast at
`src/lib/features/editor/`).

Two distinct pieces:

- **3a — Code-block live preview** for HTML / CSS / JS code blocks.
- **3b — External-media embed nodes**: Embed (iframe) and Video.

## Serialization decision (agreed, do not re-litigate)

New external-media nodes (**Embed iframe / Video**) serialize via **native HTML elements**
(`<iframe>` / `<video>`), round-tripped through mdast `html` nodes.

Rationale: keeps the on-disk markdown portable and renderer-agnostic (any markdown viewer
shows the raw HTML), and avoids inventing bespoke directive syntax.

Consequences for implementation (as built):

- **`mdast_to_pm.ts` `html` handling.** The `case "html": return null;` branch is kept for
  unrecognized HTML; recognized embeds are handled via dedicated `embed`/`video` mdast
  nodes (see next point), so `mdast_to_pm` gained `case "embed"` / `case "video"` rather
  than parsing HTML strings inline.
- **`remark_html_embed` mirrors `remark_wiki_embed`.** Implemented at
  `src/lib/features/editor/adapters/remark_plugins/remark_html_embed.ts`. Empirically,
  remark-parse emits **two different shapes**: `<iframe>` is a CommonMark block tag → a
  single block `html` node, while `<video>` is **not** a block tag → a paragraph wrapping
  inline `html` nodes. The plugin catches *both* shapes and emits `embed`/`video` mdast
  nodes. (A separate parse plugin was strictly required only for `<video>`; `<iframe>`
  alone could have been read directly, but one plugin handling both is simpler.)
- **Write side emits plain `html` nodes** in `pm_to_mdast.ts` via
  `serialize_web_embed` / `serialize_video` (`html_embed.ts`); `remark-stringify` passes
  them through verbatim, so **no custom stringify handler** was needed. Serialization omits
  empty/default attributes and uses a fixed attribute order, so round-trips are
  byte-stable for canonical input and semantics-stable otherwise (order normalizes).
- **No standalone Audio node.** Vault-local audio is already covered by `file_embed`'s
  `![[clip.mp3]]` wiki-embed syntax. Do not add an Audio block type.

## 3a — Code-block HTML/CSS/JS preview

The `code_block` NodeSpec needs a **`meta` attr** added. As of 2026-06-27 it has only
`language / height / collapsed` (`src/lib/features/editor/adapters/schema.ts`, the
`code_block: NodeSpec` definition). The mdast `code.meta` field round-trips **for free**
via `remark-stringify` (it is emitted after the language on the fence info string), so the
only schema change needed is the new attr plus parse/serialize wiring to carry
`code.meta` ↔ `node.attrs.meta`.

The preview UI itself (rendering HTML/CSS/JS output) builds on the existing code-block view
plugin (`code_block_view_plugin.ts`) — gate the preview affordance on `language ∈
{html, css, js}` and/or a `meta` flag.

## Build sequence (as built)

Followed `docs/architecture.md` decision tree (these are editor adapter-layer changes:
schema, mdast converters, remark plugins, and a NodeView/`appendTransaction` plugin).

1. **3a meta attr** ✅ — `code_block` gained a `meta` attr (schema + both converters).
   Verified by `tests/unit/adapters/code_block_meta_roundtrip.test.ts` (info string after
   the language survives markdown → PM → markdown).
2. **3a preview** ✅ — `code_preview.ts` (pure gating + sandboxed srcdoc builder) +
   `setup_html_preview()` in `code_block_view_plugin.ts`. Toggle seeded from the `preview`
   meta token; `sandbox=allow-scripts`, strict CSP. Verified by
   `tests/unit/adapters/code_preview.test.ts`.
3. **3b Embed/Video schema + authoring** ✅ (resize handles deferred) — `web_embed` +
   `video` atom nodes in `schema.ts` with sandboxed, functional `toDOM`;
   `html_embed_input_plugin.ts` converts typed/pasted iframe/video paragraphs in-editor.
   Verified by `tests/unit/adapters/html_embed_input_plugin.test.ts`.
4. **3b serialization** ✅ — `remark_html_embed` + `html_embed.ts` +
   `mdast_to_pm`/`pm_to_mdast` wiring. Verified by
   `tests/unit/adapters/html_embed_roundtrip.test.ts` (lossless `<iframe>`/`<video>`
   round-trip through disk markdown).

## Source references

- Donor editor: `/home/avocado/src/open-knowledge/packages/app/src/editor/`
- #4 (shipped) commits on `feat/editor-capability-upgrades`:
  - find options + post-replace cursor
  - paste detection + clipboard fingerprinting
  - wiki-link resolution fallback
- Carbide anchors verified 2026-06-27:
  - `src/lib/features/editor/adapters/mdast_to_pm.ts` — `html` node dropped
  - `src/lib/features/editor/adapters/schema.ts` — `code_block` attrs `language/height/collapsed`
  - `src/lib/features/editor/adapters/remark_plugins/remark_wiki_embed.ts` — pattern to mirror
  - `src/lib/features/editor/adapters/file_embed_plugin.ts` — existing `![[clip.mp3]]` audio coverage
