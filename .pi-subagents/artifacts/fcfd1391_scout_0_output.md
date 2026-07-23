# Tolaria — Feature Surface Inventory

Repo: /home/avocado/src/tolaria — Tauri 2 + React 19 markdown knowledge-base app ("Tolaria", identifier `club.refactoring.tolaria`), license AGPL-3.0-or-later (`package.json`, `LICENSE`). Formerly codenamed "laputa" (legacy names remain, e.g. `LAPUTA_CACHE_DIR`, legacy MCP name).

## 1. Editor

- **BlockNote** (rich/WYSIWYG, `@blocknote/* ^0.46.2`, with `@tiptap/pm` underneath) + a **raw markdown source mode** built on **CodeMirror 6** (`@codemirror/lang-markdown` etc.). Evidence: `package.json` deps; `src/components/Editor.tsx`, `src/components/RawEditorView.tsx`, `src/components/editorRawModeSync.ts`, `src/components/editorSchema.tsx`.
- Custom blocks: callouts, HTML block, tldraw whiteboard block, mermaid, KaTeX math, sheets. Evidence: `src/components/CalloutBlock.tsx`, `src/components/HtmlBlock.tsx`, `src/components/tldrawBlockProps.ts`, `src/components/mathInputExtension.ts`.
- Round-trip fidelity: custom markdown serialization layer with extensive regression tests — `src/utils/editorDurableMarkdown.ts`, `src/utils/compact-markdown.ts`, `src/utils/durableMarkdownBlocks.ts`, `src/utils/blockNoteDirectMarkdown.ts` (+ many `*.regression.test.ts` in `src/lib/`). `@blocknote/code-block` patch in `patches/`.

## 2. File model

- Plain-folder **vault** of markdown files; nested folders, trash, rename transactions, gitignore-aware visibility. Evidence: `src-tauri/src/vault/` (`file.rs`, `folders.rs`, `rename_transaction.rs`, `trash.rs`, `ignored.rs`).
- **YAML frontmatter** parsed/updated in Rust (`src-tauri/src/frontmatter/` — `yaml.rs`, `ops.rs`, `keys.rs`) with a properties panel UI (`src/components/DynamicPropertiesPanel.tsx`, `AddPropertyForm.tsx`).
- **Note types / templates** exist (`type_templates.rs`, `CreateTypeDialog.tsx`, `TypeSelector.tsx`); **collections** are typed views over notes with origins `builtin | type | folder | saved-view | neighborhood` (`src/collections/collectionTypes.ts`, `src-tauri/src/vault/views.rs`, `view_relationships.rs`).
- App settings/caches live in OS app-config dirs: `src-tauri/src/app_config.rs`, `src-tauri/src/settings.rs`, vault cache hashed per vault path (`src-tauri/src/vault/cache.rs`, cache dir overridable via `LAPUTA_CACHE_DIR`). In-vault agent guidance via `AGENTS.md`.

## 3. Search

- **Custom Rust full-text search** over markdown (walkdir + in-memory per-vault index with file fingerprints), ranked by match category (exact title / title / path / body) with snippet extraction and multibyte-safe boundaries. Evidence: `src-tauri/src/search.rs` (`search_vault_with_options`, `VaultSearchIndex`, `SearchMatchCategory`).
- Frontmatter can be excluded from search; gitignored files can be hidden (`hide_gitignored_files`).
- **No embeddings / semantic / vector search** — grep for `embedding|semantic|RAG` across `src/`, `src-tauri/src/`, `docs/` returns nothing. No tantivy/sqlite/ripgrep dependency (`src-tauri/Cargo.toml`, `package.json`).
- Query language: none beyond plain query + mode flag; "saved views" provide filter/sort definitions (`FilterBuilder.tsx`, `src/utils/filterDates.ts`), not a query DSL.

## 4. Links

- **Wikilinks** with rich inline editing: `src/components/inlineWikilink*.ts(x)` (suggestions, paste recovery, DOM tokens), `WikilinkSuggestionMenu.tsx`, `wikilinkInputExtension.ts`.
- **Backlinks panel** in inspector: `src/components/inspector/BacklinksPanel.tsx`, `useInspectorData.ts`.
- **Graph view: absent** — no graph component; only a "neighborhood" collection origin/history (`src/utils/neighborhoodHistory.ts`, `note-retargeting/`), which is recency/context, not a visual graph.
- **Embed/transclusion (`![[...]]`): absent** — grep for `![[` finds no implementation.

## 5. Structured data

- Properties = typed frontmatter values with editors (`propertyTypes.ts`, `PropertyValueCells.tsx`, `AddPropertyForm.tsx`); **views** (Dataview-lite) are declarative filter/sort definitions stored per vault (`src-tauri/src/vault/views.rs`, `view_date_filters.rs`, `src/utils/vaultExpressions.ts`, `CreateViewDialog.tsx`).
- **Only a list presentation exists** (`COLLECTION_PRESENTATION_LIST` in `src/collections/presentationConfig.ts`) — **no kanban, gallery, or table-grid collection view**. Calendar is only a date picker (`react-day-picker`, `calendarVersion.ts`) for filters, not a calendar view.
- Tasks: BlockNote checklists/todo blocks (`todoBlockShortcutExtension.ts`, `blockNoteChecklist.regression.test.ts`); no standalone task-management database.

## 6. Documents

- **PDF**: in-app preview via `<object type="application/pdf">` (`src/components/FilePreview.tsx`, `FilePreviewPdf`), plus **note → PDF export** in Rust (`src-tauri/src/commands/pdf_export.rs`, `src/components/useEditorPdfExport.ts`).
- **HTML files**: sandboxed iframe preview (`src/components/HtmlFilePreview.tsx` — `sandbox="allow-popups allow-popups-to-escape-sandbox"`, no `allow-scripts`; sanitization via `dompurify`, `SafeMarkup.tsx`, `htmlBlockSandbox.ts`).
- **Spreadsheets**: first-class **IronCalc** sheet editor (`@ironcalc/wasm`, `@ironcalc/workbook`; `src/components/SheetEditor.tsx`, `sheet-editor/`, `src-tauri/src/commands/sheet.rs`) — unique vs most KB apps.
- **Canvas/whiteboard**: **tldraw** block + standalone whiteboard (`tldraw ^4.5.10`, `src/components/TldrawWhiteboard.tsx`, `tldrawBlockProps.ts`).
- Code files: CodeMirror language modes + Shiki highlighting in editor; images previewed with lightbox (`ImageLightbox.tsx`); mermaid diagrams; KaTeX math.
- **EPUB reader: absent. CSV viewer: absent** (CSV only appears in unrelated contexts). No epub/csv deps in `package.json`.

## 7. Web clipping

- **Browser extension: absent.** No extension dir/manifest; no URL-to-note import. Only remote-image paste (`src/utils/remoteImagePaste.ts`, `src-tauri/src/vault/remote_image.rs`) and deep links (`@tauri-apps/plugin-deep-link`, `src/utils/deepLinks.ts`).

## 8. Citations/references

- **Absent.** No Zotero/BibTeX/DOI/bibliography code or deps (grep over `src/`, `src-tauri/src/`, `site/`, `docs/` finds nothing).

## 9. Git

- Extensive in-app git over shell git (`src-tauri/src/git/`): init (`init_repo`, `ensure_gitignore`), status/modified files w/ stats (`status.rs`), commit (`commit.rs` + `CommitDialog.tsx`), **file history & diff** (`history.rs` → `get_file_history`, `get_file_diff`, `DiffView.tsx`), **discard/restore** (`discard_file_changes`), remotes add/disconnect/test (`connect.rs`, `remote.rs`), **clone** (`clone.rs`, `CloneVaultModal.tsx`), **pull/push** with push-error classification (`remote.rs`), conflict detection/resolution incl. merge/rebase state (`conflict.rs` + `ConflictResolverModal.tsx`), file-on-remote URLs (`file_url.rs` — GitHub/GitLab-style links), workspace info (`workspace.rs`), native vs WSL git provider selection (`provider.rs`).
- **Auto-commit**: `src/utils/autoGitWork.ts`, `automaticCommitMessage.ts`, `commitEntryAction.ts`.
- **LFS: absent** (no lfs references in `src-tauri/src/`).

## 10. Sync/collaboration

- **No CRDT, no multiplayer, no team sharing.** Sync model = git pull/push only (above), plus "pulled vault refresh" handling (`src/utils/pulledVaultRefresh.ts`, `noteWindowVaultRefresh.ts`). GitHub/GitLab integration is remote-URL/file-link level, not site publishing. Multi-window support exists (separate note windows, quick launcher), but single-user.

## 11. AI

- **CLI agent providers**: claude_code (default), codex, copilot, opencode, pi, antigravity (ex-gemini), kiro, hermes — `src/lib/aiAgents.ts`; Rust launchers per CLI: `src-tauri/src/claude_cli.rs`, `codex_cli.rs`, `copilot_cli.rs`, `opencode_cli.rs`, `pi_cli.rs`, `kiro_cli.rs`, `hermes_cli.rs`, `antigravity_cli.rs` (+ discovery/config modules), `cli_agent_runtime/`.
- **Direct API models**: Anthropic, OpenAI, **Ollama (local)**, and generic OpenAI-compatible endpoints with custom base_url (covers LM Studio etc.) — `src-tauri/src/ai_models.rs` (`AiModelProviderKind::{Anthropic, OpenAi, Ollama, OpenAiCompatible}`), tool-call support in `ai_model_tools.rs`.
- In-app AI workspace/panel with wikilink references as context (`AiWorkspace*.tsx`, `AiPanel.tsx`, `WikilinkChatInput.tsx`, `src/utils/chatWikilinks.ts`, `ai-reference-content.ts`) — notes are attached as context, i.e. citation-by-reference, **but no embedding-based RAG** (see §3).
- **MCP server** (Node, bundled): `mcp-server/index.js`, `tool-service.js`. Tools exposed: `list_vaults`, `get_vault_context`, `search_notes`, `get_note`, `create_note`, `update_note`, `append_to_note`, `open_note`, `highlight_editor`, `refresh_vault`. Registered into agent configs by the app (`src-tauri/src/mcp.rs`, `McpSetupDialog.tsx`); WS bridge for UI actions (`mcp-server/ws-bridge.js`).
- **Agent docs**: per-vault `AGENTS.md` honored; docs bundle generates `AGENTS.md` (`scripts/build-agent-docs.mjs`, `mcp-server/agent-instructions.js`).

## 12. Extensibility

- **No plugin/extension system, no marketplace, no public API.** Surface area for automation is the MCP server (§11) and deep links. `src/extensions/` is CodeMirror editor extensions, not user plugins.

## 13. Platforms / license / telemetry

- Tauri 2 bundle `targets: "all"` (`src-tauri/tauri.conf.json`); OS-specific code for macOS (`macos_fullscreen_escape.rs`), Linux incl. AppImage (`linux_appimage.rs`, `LinuxTitlebar.tsx`), Windows/WSL git (`git/provider.rs`). Mobile: no evidence (desktop plugins only).
- License: **AGPL-3.0-or-later** (`package.json`, `LICENSE`, `trademarks.md`).
- Telemetry: **PostHog + Sentry**, consent-gated — `src/lib/telemetry.ts` (`posthogInstance.opt_out_capturing()`, Sentry DSN only init'd when configured), `src/components/TelemetryConsentDialog.tsx`, `PrivacySettingsSection.tsx`, `src-tauri/src/telemetry.rs`. Auto-updater via `@tauri-apps/plugin-updater` (`app_updater.rs`).

## 14. Notable / unique

- Built-in **IronCalc spreadsheets** and **tldraw whiteboards** as note content (rare in Obsidian-likes).
- PDF export of notes; "Pulse" activity view from git history (`src-tauri/src/git/pulse.rs`, `PulseView.tsx`).
- **Quick Launcher** global-shortcut window (`quickLauncher*`, `@tauri-apps/plugin-global-shortcut`); multiple note windows.
- 20+ locales (`src/lib/locales/`, `lara` i18n tooling); heavy QA investment (Playwright smoke/integration suites, editor perf benchmark `scripts/editor-performance-benchmark.mjs`).
- Docs site via VitePress (`site/`); `demo-vault-v2/` ships a getting-started vault (`src-tauri/src/vault/getting_started.rs`).
