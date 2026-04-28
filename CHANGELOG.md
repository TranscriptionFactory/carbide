# carbide

## 1.29.0

### Minor Changes

- 667ad75: ### Help guides
  - Added Guides section to Help dialog with categorized, searchable help articles
  - Guide data module with keyboard shortcuts, markdown syntax, and navigation guides

  ### Note embeds
  - New `note_embed` schema node for `![[note]]` syntax
  - Block suggest mode with editor_service block handling
  - Note embed detection, rendering, serialization, and CSS
  - Wired note_embed through lazy adapter, prod ports, and full scan
  - Fixed note embed converting while cursor is inside brackets

  ### Fixes
  - Auto-update CLI symlink on server start
  - Removed duplicate `cat` visible_alias in CLI
  - Allow empty daily notes folder (vault root)
  - Resolve linked source PDFs from omnibar/graph views

## 1.28.0

### Minor Changes

- 292c582: ### Omnibar filter mode + query persistence
  - Tab-triggered filter overlay with mnemonic chips for file type filtering (Markdown, PDF, Code, Drawing, Images) and source scope (Vault/All)
  - Query, scope, and filters persist across open/close within a session
  - Shift+Tab progressively clears filters then query; text auto-selected on reopen
  - Fixed auto-select re-firing on every render, causing typed text to be overwritten

  ### Graph view fixes
  - Route non-markdown files (PDFs, etc.) to document viewer instead of forcing markdown open
  - Resolve @linked/... virtual paths to real file paths before opening documents

  ### Performance
  - Git push/fetch/pull/push_with_upstream made async with spawn_blocking to avoid blocking the UI thread
  - Removed redundant git_status calls in commit and push flows
  - Cached find_remote("origin") in git_status
  - Added timeouts to git_add_remote/git_set_remote_url

## 1.27.0

### Minor Changes

- db4b032: ### Drift layout variant
  - Added new "Drift" layout with overlay-first design, floating activity dock, and transparent editor canvas
  - Iterative fixes: sidebar/dock alignment, grid coverage, keyframe scoping, backdrop removal, editor pane isolation

  ### Daily notes
  - Full daily notes feature: settings, sidebar view, app integration, tests
  - Configurable subfolder structure (e.g. `YYYY/MM`) and name format via settings UI
  - "Open Today's Note" command palette entry with hotkey
  - Fixed daily note that exists on disk but not in store

  ### Task query DSL
  - New task query DSL parser with slash command integration
  - TaskQueryState in CodeBlockView, callbacks wired through editor extension system
  - CSS styles for task query results

  ### Source control panel
  - Git staging state and `commit_staged` action
  - Working-tree diff viewer
  - Collapsible section extraction, layout cleanup
  - Fixed duplicate source control panel, restored activity bar in lattice layout

  ### Lattice layout
  - New lattice layout variant with title bar and right panel
  - Vertical icon strip replacing context rail tab bar, overlay panel
  - AI assistant moved from context rail to bottom panel with two-column layout

  ### Theme system overhaul
  - Converted all builtin themes to `ThemeBlueprint` + `expand_blueprint`
  - Added V4 CSS token aliases (`--fg-2`, `--glass`, `--accent-glow`, `--on-accent`)
  - `generate_ui_tokens()` with surface params and precedence tests
  - Hardcoded oklch values replaced with token references
  - New Obsidian Dark theme with glass/grain/glow variant

  ### Query panel
  - "View as graph" button added to query panel
  - Documented `?` prefix for query syntax

  ### Folder suggest
  - Drill into subfolders when selecting a parent folder in suggest

  ### Search improvements
  - Sort/filter controls and date/source/extension metadata on search graph result list
  - Prefix matching in FTS search queries
  - Word-order-insensitive fuzzy scoring

  ### Other fixes and improvements
  - Table layout toggle (fit content / full width), toolbar dismissal on blur
  - Inline AI panel dismissible via Escape in all modes
  - Generic suggest plugin factory extraction
  - Bundled plugins shipped with Carbide
  - Vault startup parallelized for non-blocking init
  - Remark/image/paste bug fixes
  - Sidebar icons updated for tags and bases

## 1.26.0

### Minor Changes

- dea327d: ### Features
  - Daily notes: full feature with folder/name-format settings, sidebar view, app integration, and daily-note-exists-on-disk handling
  - Theme system: V4 CSS token aliases (`--fg-2`, `--glass`, `--accent-glow`, `--on-accent`), `generate_ui_tokens()` with surface params, and `ThemeBlueprint` + `expand_blueprint` for all builtin themes
  - Daily notes folder and name format exposed in settings UI
  - Task query blocks: Obsidian Tasks-style DSL parser, `/tasks` slash command, live-rendered query results in `language="tasks"` code fences with grouped task list, toggleable checkboxes, and debounced re-render

  ### Fixes
  - Vault startup made non-blocking by parallelizing independent ops
  - `remark_details` inner parse, dead branch removal, and `pm_to_mdast` image merge fix
  - Diagnostics `get_markdown` moved from module scope into call site
  - Redundant `image_toolbar_plugin.ts` deleted
  - Type annotation for `nodesBetween` callback return
  - Four bug fixes: folder save, AI panel, paste handler, image resize
  - Theme token consistency and test coverage improvements
  - Daily note that exists on disk but not in store now handled correctly

  ### Refactors
  - Generic suggest plugin factory extracted
  - Hardcoded oklch values in theme CSS replaced with token refs
  - Sidebar icons updated for tags and bases

## 1.25.0

### Minor Changes

- 0c8bb36: ### Theme architecture and layout variants
  - Added Obsidian Dark theme with glass/grain/glow layout variant
  - Added lattice layout variant with title bar and right panel

  ### Source control panel
  - Added source control sidebar panel with git staging state and commit action
  - Added working-tree diff viewer with inline unified diff display
  - Extracted CollapsibleSection component for reuse across sidebar panels

  ### AI assistant layout
  - Moved AI assistant from context rail to bottom panel with two-column layout
  - Replaced context rail tab bar with vertical icon strip and overlay panel

  ### Search graph enhancements
  - Added date/source/extension metadata to search graph nodes
  - Added sort/filter controls to search graph result list

  ### Editor improvements
  - Added table layout toggle (fit content / full width)
  - Shipped bundled plugins with Carbide

  ### Welcome dialog polish
  - Added key shortcuts inline in welcome dialog step 2
  - Added built-in feature pills (Mermaid Diagrams, etc.) to welcome screen
  - Removed hero tagline, consolidated into feature pills
  - Renamed Open Notes to Omnifind in welcome shortcut list

  ### Fixes
  - Fixed inline AI panel dismissibility via Escape in all modes
  - Fixed FTS search to use prefix matching in queries
  - Fixed table toolbar dismissal when editor loses focus
  - Fixed duplicate source control panel and restored activity bar in lattice layout

## 1.24.0

### Minor Changes

- d482ae7: ### Welcome onboarding dialog
  - Added first-run welcome dialog with 3-step onboarding (vault, omnibar, AI/graph)
  - Step-completion indicators: checkmarks for vault anchoring (step 1) and AI configuration (step 3) derived from live state
  - Steps 2–3 are gated behind vault existence (dimmed with "Open a vault first" label)
  - Fixed invisible close button caused by transparent shell styling
  - Added scroll overflow for short viewports
  - Uses `Dialog.Close` primitive for accessible close behavior

  ### Configurable embedding model
  - New "Embedding Model" setting under Semantic category with 5 BERT-architecture options (Arctic XS/S/M, BGE Small, MiniLM L6)
  - Rust backend accepts model ID parameter, reinitializes when model changes, and clears/re-indexes embeddings on model version mismatch

  ### Other
  - Omnibar path resolution improvements

## 1.23.0

### Minor Changes

- f79dc15: ### Features
  - **Inline AI**: Phase 3 inline AI menu with streaming execution pipeline — context-aware commands (explain, simplify, fix, expand, custom prompt), configurable via settings, filtered to CLI providers only, wired to hotkey system (Cmd+Shift+I), clean CLI output stripping in streaming
  - **@ palette**: Unified @ mention palette replacing the date suggest plugin
  - **Settings panel**: Reorganized settings — split Layout into Editor/Sidebar, renamed Misc to Storage
  - **Command palette**: 'Plugin' badge on plugin-derived commands; reapplied plugin keyword boost and diagnostics display toggle
  - **Slides plugin**: Wiki-image support with path resolution fallback; auto-shrink overflow text

  ### Fixes
  - Fixed heading backspace and inline math double-click editing
  - Fixed heading modification on blank lines
  - Fixed cursor position issues
  - Fixed linked source bug; graph panel tidying and linked sources hidden from file tree based on settings toggle

## 1.22.0

### Minor Changes

- 5f5dbd8: ### Features
  - **Callout blocks**: Full callout block support — remark plugin, ProseMirror schema/node view, slash commands, foldable toggle, keymap navigation, Backspace deletion, and drag handle
  - **Block operations**: Turn-into, duplicate, delete operations; content-visibility optimization; multi-block selection
  - **Code editor improvements**: markdown-it port with insert handle, focus mode, language memory, fallback parse; Tab/Shift-Tab indent in both editors; focus and scroll to cursor on source→visual switch
  - **LSP enhancements**: Toggle UI controls, inline diagnostics in visual editor, LSP-sourced suggestion labels, code document sync and language server operations, position mapping and tooltip improvements, Cmd+. hover at cursor
  - **Graph view**: "View as graph" action in omnibar search results; Phase 4 performance — degradation profiles, edge sampling, degree sizing
  - **References pane**: Flat/by-source/tree view modes
  - **File explorer**: Setting to hide @linked sources from tree
  - **Plugin system**: Sidebar panel rendering with live iframe UI, plugin lifecycle activation, Smart Templates plugin, SDK extensibility — all 42 RPC methods exposed
  - **Terminal & editing**: Native xterm defaults; Paste HTML as Markdown command; within-document anchor link scrolling
  - **Theming**: Removed unused themes; lightened default dark mode
  - **Offline**: Bundled fonts for offline use

  ### Fixes
  - Fixed multiple tab-switch bugs: source editor dirty state, cursor restoration, stale content, visual editor persisting after last tab closed, source-mode edits lost
  - Fixed frontmatter loss on selectAll and undoable doc replacements
  - Fixed invisible blocks after Enter in visual editor
  - Fixed Cmd+. code actions conflict and diagnostic tooltip labels
  - Fixed missing linked-sources toggle and broken catalog categories
  - Fixed LSP & plugin coexistence: block ref handoff, hover panel routing

## 1.21.0

### Minor Changes

- ba3643f: ### Features
  - **Hybrid omnibar search improvements**: Promoted the hybrid search pipeline to the primary omnibar path, added structured queries, scoped search, semantic graph edges, and graph interaction improvements
  - **Heading autocomplete in wiki links**: Added heading completion support for `[[note#heading]]` and `[[#heading]]` flows
  - **Editor and plugin workflow improvements**: Added plugin commands to the command palette, HTML source editing support, and document metadata access via `editor.get_info`
  - **LSP provider architecture upgrades**: Introduced shared `LspProvider` abstractions, generalized provider config handling, and added Markdown Oxide support in shared client and frontend settings

  ### Fixes
  - Fixed plugin sub-resource requests to fall back to the active vault
  - Reduced embedding latency and corrected note/block embedding behavior
  - Fixed link-repair bugs, hybrid search edge cases, dirty-state handling, toolbar undo, and related search indexing issues
  - Hardened LSP behavior by addressing race conditions, stale responses, timeouts, diagnostics metadata, settings mismatches, and bundled default server configs

## 1.20.0

### Minor Changes

- c72351b: ### Features
  - **HTML-to-markdown converter plugin**: New plugin that converts HTML files to markdown, with single-file conversion support and error routing
  - **PDF export rewrite**: Migrated PDF export from jsPDF to PDFKit with bundled Inter fonts, standalone browser build, and hardened error handling
  - **Inline note embedding on save**: Notes are now embedded inline on save using blake3 change detection for efficient diffing
  - **CLI/MCP tooling improvements**: Enhanced CLI and MCP tool integrations

  ### Fixes
  - Format and lint-fix actions are now undoable via Ctrl+Z
  - Serialized xterm.js writes to eliminate TUI app flickering
  - PDF export gated to only active note tabs; frontmatter stripped from export output
  - Resolved CLI sidecar path in bundled macOS app directory
  - Resolved cargo warnings and test failures

## 1.19.0

### Minor Changes

- 161ad73: ### Search Graph
  - Full search graph tab: domain types, subgraph extraction, store, service methods, actions, DI wiring, UI components, command palette entry, and keybinding
  - Visual enhancements: color-coded nodes, score-based sizing, folder clustering
  - Reactivity and macOS hotkey fixes

  ### Graph
  - Smart link edges rendered with dashed lines and hover provenance
  - Smart link edges added to graph data model

  ### Plugin System
  - `network.fetch` and `ai.execute` RPC namespaces for plugins
  - RPC timeouts, rate limiting, and consecutive error budget
  - Settings schema: textarea type, min/max, placeholder support
  - Slash command contribution point
  - Metadata-changed event bridge to plugin SDK
  - AI and network namespace docs, permissions, and `allowed_origins`

  ### MCP Tools
  - Tier 2: backlinks, outlinks, properties, references
  - Tier 3: git_status, git_log, rename_note, plugin MCP bridge

  ### CLI
  - Git, reference, bases, tasks, and dev CLI commands with backend routes
  - Built-in termimad markdown renderer (replaces external glow dependency)

  ### Settings & UI
  - Storage & Cleanup settings section
  - Tool status cards in Settings > Tools
  - Editor width standardized as CSS custom properties

  ### File System
  - Symlinked files and folders supported in file explorer with full read+write
  - Symlink safety guardrails on all WalkDir traversals

  ### Fixes
  - Embedding pipeline CPU thrash resolved; Metal GPU support added
  - `embed_sync` no longer cancels in-flight embeds
  - Linked sources open in-app with file name as blurb
  - Import linked source entries to reference library

## 1.18.0

### Minor Changes

- c6b30b3: ### New Features
  - **HTML viewer for linked sources:** View linked source files and vault files in an HTML viewer, wired up with proper rendering
  - **Embedding toggle controls:** Disable/enable embedding per-source via settings UI toggle switches and command palette actions
  - **STT feature-gated:** Speech-to-text subsystem gated behind `stt` Cargo feature flag, removed from default main build to reduce binary size and compile times

  ### Fixes
  - **Editor:** Catch ProseMirror position errors in `dispatchTransaction` to prevent silent crashes
  - **Vault sync:** Preserve linked source content during vault sync instead of overwriting
  - **Performance:** Defer linked source embedding to batch path; reduce CPU spike when adding linked source folders; stop embedding from blocking the writer thread
  - **UI:** Fix FolderSuggestInput trailing slash and nested path bugs
  - **STT stability:** Prevent CoreAudio SIGSEGV, fix model loading blocking the async runtime, prevent transcription spinner from hanging, correct VAD model resource path
  - **Deps:** Pin `tauri-plugin-dialog` to 2.6.0
  - **CI:** Switch `generate-bindings` to macOS for `ort_sys` linker fix; make candle accelerate feature macOS-only for Linux builds

## 1.17.0

### Minor Changes

- 906703f: ### New Features
  - **Speech-to-text (STT):** Full dictation support with configurable Whisper model, custom model path, keyboard shortcut, and settings UI with expandable model catalog
  - **Block drag-and-drop:** Drag handles on editor blocks with section-aware positioning and baseline alignment per block type
  - **Block embeddings & semantic search:** Section embedding pipeline, HNSW vector index for O(log n) approximate nearest-neighbor search, `block_knn_search`, and `find_similar_blocks` command via smart links

  ### Fixes
  - **Embeddings:** Off-by-two tokenizer truncation crash, N+1 query in block similarity, stale data and tag regression, proportional throttle in dev, include last line of section in embedding text
  - **Logging:** Crash-proof logging and console cleanup, silence settings/HNSW debug spam, replace `console.error` with `create_logger` in STT adapter
  - **Editor:** Drag grip opacity, CLI sidecar resolution from correct bundle location

## 1.16.0

### Minor Changes

- c5a8ab7: ### Generic source editing, CLI enhancements, and reliability fixes
  - **Generic source editing**: Non-markdown files (YAML, TOML, JSON, etc.) can now be edited through the LSP workspace edit pipeline, using a text-by-default architecture.
  - **CLI `reindex` command**: New `carbide reindex` subcommand triggers vault re-indexing via both CLI and MCP.
  - **CLI `edit` command**: Edit vault files directly from the command line.
  - **CLI `cat` command**: Read/display file contents with glow-rendered markdown output.
  - **CLI `search --paths-only`**: Search results can now return file paths only for scripting use.
  - **CLI `tags --filter`**: Filter tags listing by pattern.
  - **CLI exit codes**: Proper exit codes for all CLI commands, enabling reliable scripting.
  - **Dynamic shell completions**: Tab completions generated from live vault state.
  - **Glow rendering**: `read` and `open` commands now render markdown through glow for rich terminal output.
  - **Undoable workspace edits**: IWE workspace edits are now undoable in both the code and visual editors.
  - **Tag normalization**: Frontmatter tags with `#` prefix are now normalized consistently.
  - **URI handling**: Fixed double-prefixed `file://` URIs from the IWE LSP server.
  - **MCP protocol**: Added camelCase serde rename to MCP protocol structs for spec compliance.
  - **CodeAction fix**: Skip `codeAction/resolve` when the action already carries an edit field.
  - **Sidecar downloads**: Added curl timeouts/retries; removed broken `--version` call from download scripts.
  - **Security**: Triaged dependabot alerts — upgraded deps and removed unused `serde_yml`.

## 1.14.0

### Minor Changes

- 6c34c7c: ### LSP typed session model and reliability improvements
  - **Typed LSP status**: `MarkdownLspStatus` enum in Rust and TypeScript replaces fragile string-based status tracking. Statuses: Starting, Running, Restarting, Stopped, Failed.
  - **Provider resolution**: Extracted `provider.rs` module for markdown LSP provider resolution (IWES/Marksman) with capability metadata.
  - **Lint lifecycle fix (BUG-010)**: `lint_close_file` returns Ok when no session exists instead of erroring.
  - **Transport diagnostics (BUG-009)**: Stderr ring buffer, init timeout (30s default, 10s for cloud-backed vaults), typed init errors (`InitTimeout`, `InitEof`, `InitFailed`), retryable/non-retryable classification.
  - **IWES packaging (BUG-005)**: Populated `platform_binaries` for auto-download from upstream `iwe-org/iwe` releases. Removed vendored sidecar binary and submodule.
  - **Vault-aware startup**: Detect iCloud/Dropbox/OneDrive vault paths, apply shorter init timeouts for cloud-backed vaults.
  - **Document lifecycle**: Added `markdown_lsp_did_close` end-to-end. Editor features gated by provider health and capabilities.
  - **MCP stdio transport**: Claude Code setup now prefers stdio via `carbide mcp` CLI proxy (matching Claude Desktop), avoiding bearer tokens in `.mcp.json`.
  - **CLI install paths**: Default to `~/.local/bin/carbide` on macOS/Linux, `%LOCALAPPDATA%\Programs\Carbide\bin\carbide.exe` on Windows.
  - **Comprehensive test coverage**: Wave 4 verification tests for provider types, status serde, toolchain registry, store state, service lifecycle, and release validation script.

## 1.11.1

### Patch Changes

- 273265b: omnifind and file search memory fixes

## 1.11.0

### Minor Changes

- c8ac662: Changeset: High-Priority Feature Implementation — 2026-04-01

## 1.10.0

### Minor Changes

- f7e41dc: Linked sources & search integration: embed linked sources in vault and add search inclusion toggle. Auto-load reference library on vault open. Fix infinite reactive loop in virtual file tree ROW_HEIGHT effect.

## 1.9.0

### Minor Changes

- 6aea234: Restore reference backend (linked sources, Zotero BBT, annotations); fix window close permissions, trailing whitespace in paragraphs, find-replace after buffer switch, virtualizer row height re-measurement, and iCloud settings write.

## 1.8.1

### Patch Changes

- c58da8c: Fix process cleanup on app close via RunEvent::Exit handler; fix vault-open CPU hotspot with async URI handlers, deferred plugin iframes, and lazy images; add asset response cache with HTTP cache headers

## 1.8.0

### Minor Changes

- c1fa394: Add Editor tuning panel (font, size, line height, zoom) under Theme > Advanced; fix OmniFind FTS thread contention causing UI blocking; fix PDF export CSP violations and wire up editor zoom hotkeys

## 1.7.1

### Patch Changes

- 49641a9: Prevent .iwe directory creation in browse mode, fix ai_prompt_builder test

## 1.7.0

### Minor Changes

- 0306368: Task management improvements (M0-M6), indexing/embedding/watcher bug fixes, tree refresh on settings change, prompt builder

## 1.5.0

### Minor Changes

- 4495f15: ### File tree blurbs
  - AI-generated note descriptions displayed inline in the file tree
  - Configurable blurb position (below heading, below caption) and toggle in Layout settings
  - Markdown formatting stripped from blurbs for clean display

  ### Theme & CSS token editor
  - New CSS token reference tab with inline editing and revert
  - Theme-aware source editor styling

  ### Editor improvements
  - Split view mode with dedicated toggle
  - Heading markers toggle for visual editor
  - Cursor sync fixes in split editor
  - Escape key clears lightbulb decoration without dismissing dropdown
  - Editor status persistence across sessions

  ### Settings
  - Spell check toggle for rich and source editors
  - Terminal customization options
  - Reference manager UI wiring

  ### IWE dynamic transforms
  - Dynamic AI provider substitution for IWE transforms
  - Config-driven transform actions wired from IWE settings
  - Config reset properly reapplies provider and guards redundant restarts
  - Open config reveals in file manager

  ### LSP
  - Proper client capabilities and config logging
  - Undoable code actions

## 1.4.0

### Editor Pipeline Rewrite

- Replaced markdown-it with remark/mdast pipeline for parsing and serialization
- Extracted ProseMirror plugins into 16 composable extensions (Moraya Pattern)
- Added Yjs integration with PM-only Y.Doc binding via ySyncPlugin
- Removed prosemirror-markdown dependency

### LSP Unification — IWE → Marksman

- Replaced IWE language server with Marksman LSP
- Deleted IWE backend, frontend modules, and all related tests
- Renamed LSP plugins (iwe*\* → lsp*\*) and cleaned DI wiring
- Unified document sync reactor across all LSP clients

### Backend Simplification

- Deleted Rust-side parsers, tags service, references service, and graph service
- Moved link extraction, metadata extraction, and graph building to frontend
- Removed ~5,000 lines of dead backend code (link_parser, frontmatter, markdown_doc, linked_source)

### Layout System

- Added 10 new layout variants: Spotlight, Cockpit, Theater, Triptych, Grounded Heavy, HUD, Zen Deck, Dashboard, Command Deck, Monolith
- Replaced split-view system with multi-tab side pane
- Added ActivityBar component with layout-aware positioning

### Stability & Performance

- Fixed memory leaks, data races, and timer deduplication issues (11 findings from state/memory audit)
- Fixed git sync spinner hang and cache thrashing
- Repaired broken CSS in glass, zen-deck, and command-deck themes
- Fixed linked source PDF loading (vault scheme, double-slash normalization)

### Status Bar

- Merged count displays, collapsed git section, removed sync button

## 1.3.0

### Minor Changes

- Reskinning prototypes: bases panel UI, LSP results redesign, IWE results streamlined
- Linked source watcher refactored to pull-based; fixed PDF loading in content pane
- Toolchain manager with binary resolver, SHA-256 verification, lifecycle management
- Composable query language with parser, evaluator, saved `.query` files, lens views
- Unified diagnostics store, AST error surfacing, unresolved link diagnostics
- Tag completion plugin, ParsedNote frontend cache, unified LSP document sync

## 1.1.0

### Minor Changes

- Full LSP client infrastructure (hover, go-to-definition, completion, formatting, rename, inlay hints, diagnostics)
- Resizable code blocks, inline SVG preview, collapsible headings and details sections
- Plugin system with lifecycle, settings UI, iframe sandboxing
- Metadata sidebar, hierarchical tag tree, heading anchors, folder path autocomplete
- Split view with real-time content sync
- System color scheme preference, file tree style variants, theme persistence
- Vault startup optimization, state management efficiency improvements
- AST-indexed schema with property registry

## 1.0.0

### Major Changes

- Plugin system and markdown lint infrastructure
- Semantic search integration with vault graph visualization
- PDF viewer, canvas, fuzzy matching, and editor polish
- Tags sidebar panel, date links, note naming templates
- Type-safe IPC, ProseMirror migration, find & replace, and theme redesign

## 0.4.0

### Minor Changes

- Plugin system, semantic search, PDF viewer, canvas, tags, ProseMirror migration

## 0.3.0

### Major Changes

- Full-vault graph view, sqlite-vec embeddings, zen mode, native menubar
