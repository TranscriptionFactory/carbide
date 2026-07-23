# OpenKnowledge (/home/avocado/src/open-knowledge) — Capability Inventory

Repo: pnpm/turbo monorepo, packages: `app` (React 19 + Vite web UI), `cli` (`ok` CLI, Node 24+), `core` (shared markdown/schema/search libs), `desktop` (Electron, macOS), `plugin` (stub — package.json only, `private: true`, no src), `server` (Hocuspocus CRDT server + HTTP API + MCP). License **GPL-3.0-or-later** (`LICENSE`, all package.jsons).

## 1. Editor

- **Framework:** Tiptap 3 / ProseMirror (`packages/app/package.json` deps `@tiptap/*` ^3.22.3, `@tiptap/y-tiptap`). Custom mdast↔PM pipeline in `packages/core/src/markdown/` (~50 files: `pipeline.ts`, `html-to-mdast.ts`, `to-markdown-handlers.ts`, guard/promoter modules like `callout-transformer.ts`, `math-promoter.ts`, `wiki-link-micromark.ts`).
- **WYSIWYG primary + raw source mode:** per-editor source-mode flag bridging a CodeMirror editor (`packages/app/src/editor/extensions/editor-mode-context.ts`; CM6 deps in `app/package.json`; `MirrorSource.tsx`).
- **Byte-fidelity claim:** real — fidelity extensions (`core/src/extensions/blockquote-fidelity.ts`, `code-block-fidelity.ts`), `round-trip-asserts.test-helper.ts`, and "byte-identical round-trip" invariants in `core/src/registry/wiki-embed-compat.test.ts` + `built-ins.ts` header. CRDT dual-observer: Y.Text source-of-truth + observer sync in `packages/server/src/persistence.ts` (OBSERVER_SYNC_ORIGIN) and `app/src/editor/binding-staleness-guard.ts`.

## 2. File model

- Opens any folder of `.md`/`.mdx` (only doc types; `core/src/constants/doc-extensions.ts` — `.mdx` precedence over `.md`). Also `.mermaid` doc files (`isMermaidDocFile`).
- Project marker: `<root>/.ok/config.yml` (`core/src/constants/ok-dir.ts`); per-machine state (locks, caches, telemetry, logs) in `.ok/local/` (gitignored). Document history lives in a **bare "shadow" git repo** at `<gitdir>/ok/` (`core/src/shadow-repo-layout.ts`).
- **Frontmatter:** YAML, parsed in `core/src/frontmatter/`; GUI property panel (`app/src/components/PropertyWidgets.tsx`, `ArrayOfObjectsWidget.tsx`); per-folder frontmatter defaults with nesting (`server/src/content/nested-folder-rules.ts`, `folder-frontmatter-write.ts`).
- **Templates:** single-frontmatter-block format with `template:` identity key + `{{date}}` substitution (`core/src/templates/template-format.ts`, `server/src/content/templates-resolver.ts`), stored in `.ok/templates/`.
- **Starter packs:** 7 packs via `ok seed` scaffolder (`server/src/seed/starter.ts` — includes `codebase-wiki`, Karpathy three-layer layout, `log.md`; `cli/src/commands/seed.ts`).

## 3. Search

- **Engine:** Orama (`@orama/orama`) in-memory index; custom ranking (lexical/fullText/recency signals, navigation vs relevance) in `core/src/search/workspace-search.ts`. Mirrors cmd-K omnibar and MCP `search`.
- **Semantic/vector search:** yes, flag-gated. Hybrid RRF fusion of Orama + cosine (`WorkspaceSemanticInput`, same file). Server side: `server/src/embeddings/` — OpenAI-compatible `/embeddings` HTTP client, default `text-embedding-3-small` (1536 dims), key from `~/.ok/secrets.yml` or `OK_EMBEDDINGS_API_KEY`; deterministic offline `concept-embedder.ts` for tests; `vector-cache.ts`. **No local-model (ollama/lmstudio) embedder** — any OpenAI-compatible endpoint URL works, key required.
- **Agentic search for MCP:** `search` MCP tool hits `POST /api/search`; `exec` gives shell-style `cat/ls/grep/find` enriched reads (`server/src/mcp/tools/search.ts`, `exec.ts`).
- Query language / saved queries: **absent**.

## 4. Links

- **Wikilinks:** `[[...]]` micromark extension (`core/src/markdown/wiki-link-micromark.ts`), link path suggestions/autocomplete (`app/src/editor/link-path-suggestions.tsx`), `api-suggest-links`.
- **Backlinks:** server index `server/src/backlink-index.ts` + `api-backlinks`; UI panel `app/src/components/LinksPanel.tsx`.
- **Graph view:** yes — `app/src/components/GraphView.tsx`, `GraphPanel.tsx`, `GraphLegend.tsx` using `react-force-graph-2d`.
- **Embeds/transclusion:** Obsidian-compatible `![[file.ext|alias]]` — four compat descriptors **WikiEmbedImage / WikiEmbedVideo / WikiEmbedAudio / WikiEmbedFile**, read-only compat rendering through canonical Image/Video/Audio/File, byte-identical serialize back to wiki-embed source (`core/src/registry/built-ins.ts` lines ~780-1600, `wiki-embed-compat.test.ts`). **WikiEmbedPdf was removed** — `![[doc.pdf]]` falls back to File row; PDF viewing only via explicit `<Pdf src/>`. No note-transclusion (`![[note]]` section embed) — file/media embeds only.

## 5. Structured data

- Frontmatter properties panel (typed widgets) — yes (`PropertyWidgets.tsx`, folder properties card).
- Dataview-like database/table views over frontmatter: **absent** (no query views found).
- Tasks: GFM task-list checkboxes via Tiptap starter-kit (taskItem NodeView in clipboard-walker) — editing only; no task dashboard.
- Kanban / calendar views: **absent** (`ui/calendar.tsx` is just a shadcn date-picker primitive).

## 6. Documents

- **PDF:** full viewer — pdfjs-dist multi-page canvas with toolbar (`app/src/editor/components/Pdf.tsx`, `pdf-layout.ts`; descriptor in `built-ins.ts`).
- **EPUB:** ingest-only. `.epub` classified as binary in `server/src/mcp/tools/ingest-body.ts` (raw-byte preservation via wiki-embed asset surface). No EPUB reader.
- **HTML embedding:** `<Embed>` generic iframe descriptor with strict trust model — http/https only, no `data:`/`blob:`/`javascript:`, `allow-scripts` only for cross-origin (same-origin + scripts = sandbox-escape blocked), explicit sandbox token set, honors X-Frame-Options (`app/src/editor/components/Embed.tsx`). Code-block previews have their own CSP (`app/src/editor/extensions/code-block-preview-csp.test.ts`).
- **CSV/spreadsheets:** no renderer — CSV/TSV treated as binary ingest/attachment only (`ingest-body.ts`). No canvas/whiteboard (absent). Code files: syntax-highlighted code blocks (lowlight, `code-block-lowlight-plugin.ts`) + CM6 in source mode; editor only opens md/mdx docs.
- **Images/audio/video:** first-class descriptors (Image w/ zoom, Video w/ YouTube/Loom/Vimeo facades, Audio), upload pipeline w/ sha256 dedup + MIME allowlists (`core/src/constants/upload.ts`, `app/src/editor/image-upload/`).

## 7. Web clipping

- No browser extension. Closest: MCP `workflow({kind:"ingest"})` — agent-driven URL→note/binary capture into the vault (`server/src/mcp/tools/ingest-body.ts`, `discover-body.ts`); `research` workflow fetches+cites sources. No user-facing one-click clipper.

## 8. Citations/references

- Zotero/BibTeX/DOI/bibliography: **absent** (only "cite" as an Obsidian callout-type alias in `core/src/markdown/callout-transformer.ts`). Research workflow writes a `sources:` frontmatter list (`server/src/mcp/tools/research-body.ts`) — that's the whole citation story.

## 9. Git

- Shadow bare repo per project = version history (`core/src/shadow-repo-layout.ts`); MCP `checkpoint` / `restore_version` / `history` tools (`server/src/mcp/tools/checkpoint.ts`, `restore-version.ts`, `history.ts`).
- Branch info + checkout + worktree support (`server/src/git-checkout.ts`, `git-branch-info.ts`, `core/src/git/worktree-*.ts`); branch fanout handling in app (`branch-invalidation.ts`).
- **Auto-sync:** background `SyncEngine` — fetch/merge/push, squash-before-push, backoff, conflict storage (`server/src/sync-engine.ts`); UI `AutoSyncEnableWarning.tsx`. Auto-commit of edits into shadow repo per write.
- CLI: `ok clone/pull/push` (`cli/src/commands/clone.ts`, `pull.ts`, `push.ts`); GitHub auth via `gh` token (`gh-token-source.ts`, `github-permissions.ts`).
- **LFS:** not supported — only error classification for LFS quota failures and a "use manual curl + Git-LFS" escape note (`server/src/error-classification.ts`, `ingest-body.ts`).

## 10. Sync/collaboration

- **CRDT:** Yjs + Hocuspocus server 4.0.0-rc (`server/package.json`), `@tiptap/y-tiptap`, collaboration cursors/awareness (`app/src/editor/awareness-user.ts`, `agent-presence.ts` server-side), IndexedDB client persistence (`client-persistence.ts`).
- **Team sharing:** GitHub-substrate share URLs for doc/folder (read-only URL construction; agents explicitly do NOT get publish wizard) — `server/src/mcp/tools/share-link.ts`, `core/src/sharing/share-url.ts`, `receive-flow.ts`; CLI `ok cowork` (`cli/src/commands/cowork.ts`). Sharing mode field in project creation (`app/src/components/SharingModeField.tsx`). Publish-to-GitHub is a user-only wizard flow.

## 11. AI

- **Providers/harnesses:** integrations are **CLI/desktop-app handoffs + config writing, not API calls** — Claude Code/Cowork (`claude://` deep links, `core/src/handoff/claude-url.ts`), Codex Desktop (`codex://`), Cursor (deeplink), OpenCode, OpenClaw, Gemini, Pi (`cli/src/integrations/pi-extension.ts`); MCP config written into `.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`, `opencode.json`, etc. (`cli/src/commands/editors.ts`). Side-by-side agent via handoff menu (`app/src/components/handoff/`).
- **Embedded terminal:** yes — xterm.js 6 + node-pty, desktop-only, per-project opt-out (`app/src/components/TerminalDock*`, `desktop/package.json`, `settings/TerminalSection.tsx`).
- **Inline AI edit:** `EditWithAiPopover.tsx`, `edit-with-ai-selection.ts`, bubble-menu `EditWithAiBubbleButton.tsx` — dispatches selection to an external agent (not in-app LLM completion).
- **RAG over vault:** hybrid semantic search with per-doc cosine signals (§3); research/consolidate workflows produce sourced docs (citation = `sources:` frontmatter, not inline chat-with-citations).
- **MCP server** tools (`server/src/mcp/tools/index.ts` header): reads — `exec, search, history, links, skills, config, palette, preview_url, share_link`; writes — `write, edit, delete, move, checkpoint, restore_version`; conflicts — `conflicts, resolve_conflict`; workflow — `workflow` (ingest|research|consolidate|discover); plus `install` (skill install).
- **Skills:** first-class entities (`.ok/skills/`, project + global scopes), skills sidebar, skill packs installed per starter pack (`server/src/skill-bundles.ts`, `seed/install-pack-skill.ts`, `mcp/tools/skills.ts`).
- **MCP client** (app consuming external MCP servers): **absent** — MCP surface is server-only.

## 12. Extensibility

- `packages/plugin` is a **stub**: only `package.json` (`@inkeep/open-knowledge-plugin`, private, v0.3.1), no source. No plugin API, no marketplace. Extensibility today = component registry (`core/src/registry/` — `createRegistry().set(...)` for custom JSX descriptors), markdownlint plugin browser (`server/src/lint-plugins/`, settings UI), custom themes (`CustomThemeEditor.tsx`), and skills/MCP.

## 13. Platforms / license / telemetry

- macOS Electron app (electron-builder, universal build, `packages/desktop/electron-builder.yml`; only `build:mac` scripts). Linux/Windows/Intel-Mac = web UI served locally via `ok start` CLI (README). Loopback-bound server (`cli/src/loopback-bind-discipline.test.ts`).
- License: GPL-3.0-or-later everywhere.
- **Telemetry:** OpenTelemetry traces only, opt-in via `VITE_OTEL_ENABLED=true`, defaults to localhost collector (`app/src/telemetry-impl.ts`, lazy-loaded); local file sinks under `.ok/local/` (`server` telemetry-file-sink). **No PostHog/Sentry/amplitude found.**

## 14. Notable / unique

- **MDX/JSX components in markdown** with PropPanel GUI editing — canonical pack: Callout (15 types: 5 GFM + 10 Obsidian-parity), Image, Video, Audio, Accordion (details/summary substrate), Math (KaTeX), MermaidFence, Pdf, File, Tabs/Tab, Embed (`core/src/registry/built-ins.ts`); wildcard `*` descriptor keeps unknown JSX as editable raw-MDX.
- Mermaid validation + standalone `.mermaid` docs (`server/src/mermaid-validator.ts`).
- Link previews (`server/src/link-preview/`, settings section), markdownlint integration with GUI rule browser + autofix (`server/src/lint/`, `app/src/editor/apply-lint-fix.ts`).
- Agent-awareness: agent presence/activity/focus tracking + CRDT convergence tests for agent writes (`server/src/agent-*.ts`).
- CLI breadth: `init, start, open, seed, clone, pull, push, cowork, editors, mcp, lint, preview, diagnose, bug-report, migrate, clean, deinit` (`cli/src/commands/`).
- Slides/publishing-to-site: **absent** (preview = local preview URL only).

## Start-here files

`packages/core/src/registry/built-ins.ts` (component surface), `packages/server/src/mcp/tools/index.ts` (agent surface), `packages/core/src/search/workspace-search.ts` (search), `packages/server/src/sync-engine.ts` (sync), `core/src/shadow-repo-layout.ts` (versioning).

## Residual risks

- sqz output compression elided some directory listings; spot-checked via targeted reads but a few `app/src/components` files may be unenumerated.
- Feature-flag default for semantic search not verified (config resolution in `semantic-config.ts` suggests off-unless-keyed).
- `packages/docs` intentionally excluded per instructions.
