# Plan: Editor block types & embeds (#3) — deferred follow-up to capability upgrades

## Status

**Deferred.** This is item **#3** of the open-knowledge → Carbide editor port. Item **#4
(capability upgrades)** shipped on branch `feat/editor-capability-upgrades`
(2026-06-27): case-sensitive / whole-word find with post-replace cursor advance, stronger
paste-is-markdown detection + clipboard-source fingerprinting, and a frontend wiki-link
resolution fallback. #3 was split out at sign-off so #4 could land independently.

This document preserves the **serialization decision** agreed during #4 planning so it is
not lost, and sketches the build sequence for when #3 is picked up.

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

Consequences for implementation:

- **`mdast_to_pm.ts` currently drops `html`.** As of 2026-06-27 the converter has
  `case "html": return null;` (in `src/lib/features/editor/adapters/mdast_to_pm.ts`, the
  `html` branch of the node switch). #3 must replace that with logic that recognizes
  `<iframe>` / `<video>` HTML and produces the corresponding PM nodes.
- **Add a remark plugin mirroring `remark_wiki_embed`** (see
  `src/lib/features/editor/adapters/remark_plugins/remark_wiki_embed.ts`, ~1.4K) to handle
  the embed HTML on the parse side, and a `pm_to_mdast.ts` path that emits `html` nodes on
  the write side. `remark-stringify` passes `html` nodes through verbatim.
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

## Build sequence (when picked up)

Follow `docs/architecture.md` decision tree first.

1. **3a meta attr** → verify: `code.meta` survives a markdown → PM → markdown round-trip
   (add `pm_to_mdast` / `mdast_to_pm` test).
2. **3a preview** → verify: an `html`/`css`/`js` code block renders a live preview pane;
   toggling preview does not corrupt source.
3. **3b Embed/Video schema + views** → verify: node renders; resize/controls behave.
4. **3b serialization** (the decision above): remark plugin + `mdast_to_pm` `html` handling
   + `pm_to_mdast` `html` emission → verify: `<iframe>`/`<video>` round-trips losslessly
   through disk markdown.

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
