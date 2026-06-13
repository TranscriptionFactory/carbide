# Carbide Feature Opportunity Assay

**Date:** 2026-06-11
**Status:** Analysis complete

---

## Executive Summary

Carbide has built an extraordinary foundation: local-first Tauri/Rust desktop app with 40 feature modules, a sandboxed plugin system, built-in MCP server, hybrid FTS5+embedding search, git integration, bases (database views), canvas, embedded terminal, and an action registry of 420+ named operations. The codebase architecture (Ports + Adapters, hexagonal design with strict layer linting) is unusually clean for a project of this scope.

The current TODO.md and planning documents are thorough on **refinement** of existing features — polish, gap-filling, and incremental improvements. However, the roadmap under-indexes on **category-creating** features that would differentiate Carbide from Obsidian, Notion, and Logseq. This document identifies the highest-leverage **unplanned** features that would augment Carbide's current capabilities and establish a differentiated market position.

---

## What's Already Planned (for context)

These are documented in TODO.md and various plans — included here only to avoid duplication:

| Feature | Status |
|---|---|
| Encryption (at-rest, age-format + OS keychain) | Evaluated, deferred — needs architectural spike |
| Bulk property rename/delete with git rollback | Planned, not started |
| Nested property flattening (dot notation) | Planned, not started |
| Graph FTS overlay + section/block edges | Planned, partially scaffolded |
| Mermaid polish, image context menu, formatting toolbar | Planned |
| Contextual command palette (`when()` guards) | Planned |
| AI structured edit proposals | Planned |
| Obsidian compatibility shim (`@carbide/obsidian-compat`) | Deferred |
| Plugin SDK package (`create-carbide-plugin`) | Deferred |
| CLI TUI mode (ratatui) | Deferred, likely permanent |
| Timeline layout ("The Stream") | Fully designed, not implemented |
| Atelier UI redesign (zero-chrome, paper/ink) | Fully designed, not implemented |
| Speech-to-text (Handy STT port) | Research complete, not started |
| Harper LSP (grammar checker) | Brief recommendation |
| Actions System Phase 2+ (MCP bridge, AI actions, sequences) | Designed, deferred |
| HTML Artifacts Phase 4 (vault-RPC, persistent state) | Deferred |
| Markdown syntax parity (callouts, footnotes, comments) | Assessed, not scheduled |
| Saved task views (task query Phase 4) | Not started |
| File Explorer Phase 3 (peek preview, workspace snapshots) | Planned |
| Remote markdown sync (multi-root git workspace) | Designed, deferred |

---

## Methodology

Each candidate feature is evaluated on:

- **Differentiation** — Would this make Carbide stand out in a crowded market (Obsidian, Notion, Logseq, Joplin, Bear, Reflect)?
- **Leverage** — How much existing infrastructure does it exploit? Lower build cost = higher ROI.
- **Impact** — How transformative is it for the core use cases (knowledge management, research, writing, planning)?
- **Creative novelty** — Is this something no competitor does well, or at all?

---

## Tier 1 — Game-Changers (Highest Impact × Differentiation)

### 1. Vault RAG Chat — Conversational AI Over Your Knowledge Base

**What:** A full chat interface that answers questions by retrieving relevant notes, embedding them as context, and generating cited, sourced responses — all local-first with streaming.

**Why it's different:** Obsidian has 20+ community plugins attempting this (Copilot, Smart Connections, BMO, etc.) — none match what a built-in implementation could achieve. Carbide already has the hard parts: BGE-small embeddings, hnsw_rs vector index, Reciprocal Rank Fusion search, and an MCP server that exposes this surface to external agents. The missing piece is a chat UI + retrieval-augmented generation loop that streams responses with source annotations.

**Architecture fit:**
- Leverages: `search/` (FTS5 + semantic), `ai/` (CLI providers), `editor/` (for rendering responses as rich markdown), `mcp/` (exposes RAG as MCP tools)
- New: `rag/` feature module with chat store, conversation service, context assembler, response renderer
- Frontend-side (TypeScript), using existing `ai.execute` transport + a new retrieval pipeline that wraps the search index

**Key capabilities:**
- "What did I write about Kubernetes deployments?" → retrieved snippets + synthesized answer
- "Find all my meeting notes about the Q3 roadmap and summarize" → cross-note synthesis
- "What are the open questions in my research vault?" → structured analysis across notes
- Source attribution with clickable note links, confidence scoring
- Conversation history persisted in a `.carbide/chat/` folder as markdown

**Competitive landscape:** Notion AI is $10/user/month and cloud-only. Obsidian requires plugins. Logseq has no built-in AI. Bear has no AI. This would be the first local-first, privacy-respecting RAG chat in a major note-taking app.

---

### 2. Visual Automation Builder — Node-Graph Workflow Engine

**What:** A visual node-graph editor where users connect triggers (file change, schedule, webhook, plugin event) to actions (create note, run template, execute AI, move file, send notification) with conditional branching.

**Why it's different:** No note-taking app has a visual workflow builder. Notion has basic automations (if this then that, limited to their database). Obsidian requires community plugins for any automation. Carbide's 420+ action registry is a perfect dispatch surface — every action is already named, typed, and permission-gated. The plugin event bus already publishes file-created, file-modified, etc. events. The reactor system already demonstrates internal automation patterns (autosave → auto-commit, etc.).

**Architecture fit:**
- Leverages: `action_registry/` (420+ named actions), `plugin_event_bus/` (10 event types), `mcp/` (external triggers), `plugin/` (plugin-contributed actions), `reactors/` (proven automation pattern)
- New: `workflows/` feature module with workflow store, graph editor UI, workflow engine (event → evaluate conditions → dispatch actions)
- Reactors become user-facing — the internal autosave → autocommit chain becomes a visible workflow users can inspect/modify

**Example workflows:**
- **Daily startup:** `on_app_start` → open today's daily note → apply daily journal template → show task summary in sidebar
- **Inbox triage:** `on_file_created("inbox/*")` → wait 24h → if no tags → run AI to classify → move to appropriate folder
- **Reading workflow:** `on_file_created("reading/*")` → extract metadata → if has arXiv ID → fetch abstract → create reference entry
- **Weekly review:** `on_schedule("weekly")` → find all notes modified this week → generate summary note → open in editor

**Key design decisions:**
- Workflows stored as `.carbide/workflows/*.yaml` (human-readable, versionable)
- Workflow engine runs in frontend (has full action registry access)
- Can be exposed as MCP tools (external agents can trigger workflows)
- Visual editor is a specialized canvas mode (reuses Excalidraw/Pixi infrastructure)

---

### 3. One-Click Vault Publishing — Static Site from Notes

**What:** Select a folder or entire vault → one click → static site generated and deployed. Markdown notes become web pages with wikilinks resolved, backlinks rendered, graph embedded, search enabled, and themes applied.

**Why it's different:** Obsidian Publish costs $8–$16/month. It's a significant revenue driver but also a significant friction point. An open-source, local-first alternative that produces self-contained static sites (deployable to GitHub Pages, Netlify, or any static host) would eliminate that friction entirely and attract users who balk at subscription pricing.

**Architecture fit:**
- Leverages: `vault/` (file system), `links/` (wikilink resolution), `graph/` (embedded graph widget), `search/` (client-side FTS via compiled index), `themes/` (apply vault theme to site), `export/` (existing export infrastructure)
- New: `publish/` feature module with site generator, deployment adapters (GitHub Pages, Netlify, local folder), configuration UI
- Builds on existing markdown rendering pipeline (ProseMirror → HTML output)

**Key capabilities:**
- Per-note publish toggle (public/draft/private)
- Wikilink → `<a href>` resolution
- Embedded backlinks section
- Interactive graph visualization (compiled from vault, rendered in-browser)
- Client-side search (pre-built FTS index exported as JSON/WebAssembly)
- Theme parity with desktop app
- Password-protected notes (if encryption lands first)
- RSS feed for published notes
- Custom domain support via deployment adapter

**Competitive landscape:** Obsidian Publish is the only direct competitor. Notion allows public pages but not full-site publishing from a workspace. Logseq has no publishing. This is a major differentiator with clear migration appeal for Obsidian users.

---

### 4. Content-Aware Smart Blocks — Living, Self-Updating Note Components

**What:** Special block types that render dynamically based on context — not just static markdown. A "task summary" block that always shows open tasks from the current folder. A "backlinks" block that updates as you link. A "calendar" block showing this week's daily notes. A "quote of the day" block pulling from a `quotes/` folder.

**Why it's different:** Notion has database blocks that update. Obsidian has Dataview (community plugin, extremely popular — 3M+ downloads). Dataview's popularity demonstrates massive demand for dynamic content in notes. But Dataview is a plugin with its own query language, its own rendering, and no composition. Carbide can do better by making dynamic blocks a first-class concept integrated with the existing query system, bases views, and editor.

**Architecture fit:**
- Leverages: `query/` (structured query language), `bases/` (table/list/kanban/gallery/calendar views), `tasks/` (task query), `editor/` (block rendering in ProseMirror/CodeMirror), `search/` (FTS5 backend)
- New: `smart_blocks/` feature module (or extend `bases/` and `query/`) with block type registry, reactive re-render system, block configuration UI, smart block properties panel
- Extends existing `![[embed]]` syntax with query-driven embeds

**Key capabilities:**
- `![[query:tasks due:this week]]` — embedded task list that updates in real time
- `![[query:notes tagged:#project-x sort:modified desc limit:10]]` — recent project notes
- `![[backlinks]]` — auto-updating backlinks section (currently only in sidebar)
- `![[calendar:2026-06]]` — mini calendar showing daily notes for the month
- `![[table:property:status group:project]]` — inline kanban from frontmatter
- Smart blocks respect editor permissions and can be toggled between rendered/interactive/source modes

**Competitive landscape:** Dataview (Obsidian plugin) dominates this space but has friction: separate query language, no visual editor, limited block types. Notion has database blocks but they're tied to Notion's proprietary data model. Carbide can offer this natively with a unified query language and visual block editor.

---

## Tier 2 — Strong Augmentations (High Impact, Lower Build Cost)

### 5. Rich Structured Diff & History Browser

**What:** A visual version history browser that shows what changed between versions — not just line diffs, but semantically-aware diffs that understand heading changes, moved blocks, property modifications, and link additions/removals.

**Why it's unplanned but valuable:** Carbide already has full git integration (init, commit, diff, restore, checkpoints). But diff output is plain text. A structured diff viewer that renders markdown with highlighted changes, shows a time slider for navigating history, and allows selective restore of individual blocks would make the git integration accessible to non-technical users and transformative for writing workflows.

**Architecture fit:**
- Leverages: `git/` (backend git2 operations), `editor/` (markdown rendering), `document/` (document viewer)
- New: `history/` feature module with diff engine (structured, not line-based), time slider UI, block-level restore
- Could integrate with Timeline layout: each commit becomes a timeline entry with inline diff preview

**Key capabilities:**
- Side-by-side rendered diff with additions in green, deletions in red, moves in blue
- Time slider for scrubbing through history
- Block-level restore ("restore this paragraph from 3 versions ago")
- Named checkpoints surfaced in UI (not just git tags)
- See who made what change (author attribution via git)

---

### 6. Web Clipper Browser Extension

**What:** A browser extension (Chrome/Firefox/Safari) that clips web content directly into the vault — full page, selection, or simplified reader view — with preserved metadata (URL, title, date, author) as frontmatter.

**Why it's unplanned but valuable:** Every major note-taking app has a web clipper (Obsidian, Notion, Evernote, Bear, Joplin). Its absence is a blocker for many potential users. Research workflows (the creator's use case) depend on web clipping. The extension communicates with the running Carbide app via a local HTTP endpoint (the MCP server's axum instance) and deposits content as markdown + frontmatter.

**Architecture fit:**
- Leverages: `mcp/` (existing local HTTP server), `plugin/` (permission model, iframe sandboxing concepts), `vault/` (file creation), `metadata/` (frontmatter extraction)
- New: `clipper_extension/` (JavaScript browser extension, separate repo), `clipper/` feature module (receiving endpoint, content processing, template application)
- Uses existing axum HTTP server with a new `/clipper` route
- Content processed through existing markdown pipeline

**Key capabilities:**
- Clip full page, selection, or simplified article view
- Auto-extract metadata (Open Graph, Schema.org, Dublin Core)
- Apply templates to clipped content
- Tag on capture
- Screenshot capture option
- Queue offline clips for sync when app opens

---

### 7. Spaced Repetition / Flashcards

**What:** Turn any note or note section into flashcards using SM-2 spaced repetition. Toggle blocks for question/answer, deck management, review scheduling, and progress tracking — all within the vault as markdown.

**Why it's unplanned but valuable:** Learning and study is a major knowledge management use case. Obsidian has the Spaced Repetition plugin (200K+ downloads). Anki is a separate app with 10M+ users. Carbide can integrate this natively, making notes both the source material and the study deck — no export/import required.

**Architecture fit:**
- Leverages: `editor/` (toggle blocks for Q&A), `metadata/` (frontmatter for scheduling data), `bases/` (deck views), `tasks/` (due-for-review tracking)
- New: `srs/` feature module with SM-2 algorithm, review scheduler, deck browser, review session UI
- Cards defined inline in notes using a `?question /n answer` syntax or frontmatter
- Scheduling metadata stored in note frontmatter (human-readable, versionable)

**Key capabilities:**
- Inline flashcard syntax in any note
- Deck management via folders or tags
- Review sessions with keyboard-driven rating (Again/Hard/Good/Easy)
- Review scheduling with heatmap
- Card templates for different formats (basic, cloze, image occlusion)
- Progress dashboard showing streaks, retention rates, forecast

---

### 8. OCR Pipeline — Make All Visual Content Searchable

**What:** Automatic OCR on images and PDFs added to the vault. Extracted text is stored alongside the file, indexed by FTS5, and surfaced in search results with snippet previews.

**Why it's unplanned but valuable:** Screenshots, photos of whiteboards, scanned documents — these are opaque blobs in most note apps. Making them searchable transforms the vault's information density. Critical for research use cases (the creator is a computational biology PhD student). The Handy STT research shows willingness to pull in Rust-native inference — OCR is the visual analog.

**Architecture fit:**
- Leverages: `watcher/` (detect new images/PDFs), `search/` (FTS5 indexing), `document/` (PDF viewer), `metadata/` (store OCR results)
- New: `ocr/` feature module with Tesseract or PaddleOCR Rust bindings, OCR queue, result store
- Runs as background task on file import/watcher detection
- OCR results stored as `.carbide/ocr/<file-hash>.txt` (cache, not in vault)

**Key capabilities:**
- Automatic OCR on paste/drop/import
- Manual trigger via context menu on any image/PDF
- Search results highlight OCR-matched text with image region preview
- Language selection per document
- GPU-accelerated inference (Metal on macOS)
- Respects vault encryption boundaries

---

### 9. Audio Notes — Inline Recording with Transcription

**What:** Record audio directly into a note (inline, like an image embed), with automatic transcription and speaker diarization. Different from the planned STT dictation mode — this is about capturing meetings, lectures, and voice memos as rich, searchable note attachments.

**Why it's unplanned but valuable:** The STT research focuses on dictation (real-time speech → text insertion). Audio notes are a complementary use case: record now, transcribe later, keep both audio and text. Meeting notes, lecture capture, field recordings, voice journaling — all become first-class Carbide content.

**Architecture fit:**
- Leverages: planned `stt/` feature module (Handy STT port), `document/` (media viewer), `editor/` (inline embeds)
- Extends: `stt/` with audio file transcription mode, speaker diarization, audio player widget
- Audio stored as standard audio files in vault (`.mp3`, `.wav`, `.m4a`)
- Transcription stored alongside as `<filename>.transcript.md`

**Key capabilities:**
- One-click recording from editor toolbar
- Inline audio player with waveform visualization
- Auto-transcription on recording complete (or queued for later)
- Speaker diarization for multi-speaker recordings
- Timestamp-linked transcript (click timestamp → jump to audio position)
- Searchable via FTS5 (indexes transcript text)
- Export transcript as markdown note with timestamps

---

### 10. Cross-App Annotation Sync (Readwise, Kindle, Hypothes.is)

**What:** Sync highlights and annotations from reading platforms (Kindle, Readwise, Hypothes.is, Apple Books) into Carbide as structured notes with metadata.

**Why it's unplanned but valuable:** Reading and notetaking are deeply connected workflows. The Zotero integration is already built — this extends the reference/academic use case to consumer reading platforms. Readwise aggregates highlights from multiple sources; syncing them into Carbide makes the vault the central repository for all captured knowledge.

**Architecture fit:**
- Leverages: `references/` (citation and metadata infrastructure), `metadata/` (frontmatter), `plugin/` (could be plugin-native, similar to scientific paper tracker)
- New: Can be implemented as a bundled plugin using `network:fetch` + `fs:write` permissions, or as a native feature for tighter integration

**Key capabilities:**
- Readwise API sync (highlights, tags, notes)
- Kindle clippings file import
- Hypothes.is feed integration
- Highlights rendered as blockquotes with source attribution
- Auto-tagging by book/source
- Periodic sync (not just one-shot import)

---

## Tier 3 — Niche But Unique (Specialized Differentiators)

### 11. Data Visualization from Bases

**What:** Generate charts (line, bar, scatter, pie) from frontmatter properties using a simple block syntax. `![[chart:type:line property:word_count group:created]]` renders an inline chart.

Leverages `bases/` and `query/` infrastructure. Unique in the note-taking space — no competitor has inline data visualization from frontmatter properties.

### 12. Scheduled API Import

**What:** Configure recurring imports from external APIs (RSS feeds, GitHub issues, weather, arXiv categories) into vault folders. A scheduled task system that runs vault-safe HTTP requests and deposits results as markdown notes.

Leverages `network:fetch` (proxied, SSRF-protected) and `plugin/` infrastructure. Could be a bundled plugin.

### 13. Map / Geospatial View

**What:** If notes have `location` frontmatter (lat/lng), render them on an interactive map. Click a pin to open the note. View all notes from a region.

Useful for travel journals, field research, real estate, event planning. Uses Leaflet or MapLibre (no API key required for offline tiles).

### 14. Federated Note Sharing

**What:** Share individual notes or folders peer-to-peer via WebRTC or libp2p. No cloud, no server — direct encrypted transfer to another Carbide user. Recipient gets a read-only or editable copy in their vault.

Ambitious and technically complex, but would be genuinely unique in the note-taking space.

---

## Opportunity Cost Assessment

### What Should NOT Be Prioritized

Several planned items are lower-impact than they appear:

- **Formatting toolbar** — users who want a toolbar use Notion. Carbide's keyboard-first design is a feature, not a bug.
- **CLI TUI mode** — the CLI is useful for headless operations. A TUI duplicates the desktop app in a worse environment. Already deferred, keep it that way.
- **Obsidian compatibility layer** — gated on adoption, which won't happen without the features in this document. Premature optimization.
- **Plugin SDK package** — needed eventually, but 7 bundled plugins don't justify a scaffolding toolchain yet.

### Strategic Sequencing

The highest-ROI sequence:

1. **Vault RAG Chat** (Tier 1) — leverages existing AI + search infrastructure, immediately differentiates, highest user pull
2. **Content-Aware Smart Blocks** (Tier 1) — makes all existing features (tasks, bases, search, backlinks) composable inside notes
3. **Visual Automation Builder** (Tier 1) — turns the action registry from internal dispatch into user-facing power
4. **Web Clipper** (Tier 2) — removes adoption blocker, relatively quick build
5. **One-Click Publishing** (Tier 1) — strong Obsidian migration incentive

The remaining Tier 2-3 items can be interspersed based on user demand and contributor interest.

---

## Summary Matrix

| Feature | Differentiation | Build Complexity | Leverages Existing | Creative Novelty |
|---|---|---|---|---|
| Vault RAG Chat | ★★★★★ | Medium | ★★★★★ | ★★★★ |
| Visual Automation Builder | ★★★★★ | High | ★★★★★ | ★★★★★ |
| One-Click Publishing | ★★★★★ | Medium | ★★★★ | ★★★ |
| Smart Blocks | ★★★★ | Medium | ★★★★★ | ★★★★ |
| Structured Diff/History | ★★★ | Low | ★★★★★ | ★★★ |
| Web Clipper | ★★★ | Medium | ★★★ | ★★ |
| Spaced Repetition | ★★★ | Low | ★★★ | ★★★ |
| OCR Pipeline | ★★★ | Medium | ★★★ | ★★★ |
| Audio Notes + Transcription | ★★★★ | High (if STT lands first) | ★★★ | ★★★★ |
| Annotation Sync | ★★★ | Low | ★★★ | ★★ |
| Data Viz from Bases | ★★★ | Low | ★★★★ | ★★★ |
| Scheduled API Import | ★★ | Low | ★★★ | ★★ |
| Map/Geospatial View | ★★ | Low | ★★ | ★★★ |
| Federated Note Sharing | ★★★★★ | Very High | ★ | ★★★★★ |

---

## Conclusion

Carbide's architecture is a launchpad. The action registry, MCP server, embedding index, plugin system, and bases/graph/canvas triad are not just features — they're primitives that can be composed into category-defining capabilities. The highest-leverage investment is in features that **compose** these primitives (RAG Chat, Smart Blocks, Automation Builder) rather than features that **duplicate** what competitors already offer. Carbide shouldn't try to be a better Obsidian — it should be the first **intelligent, automatable knowledge workbench**.

---

# Appendix A: Vault RAG Chat — Implementation Blueprint

## Existing Infrastructure (Zero New Dependencies Required)

Every building block for Vault RAG Chat already exists in the codebase:

| Capability | Location | How it's used |
|---|---|---|
| **Hybrid search** (FTS5 + BGE-small embeddings + RRF) | `SearchPort.hybrid_search()`, Rust `hybrid.rs:9` | Retrieves top-N relevant notes for a user question |
| **Semantic similarity** (find related notes by embedding) | `SearchPort.find_similar_notes()` | Already used by `AiService.fetch_vault_context()` to inject context into AI prompts (`ai_service.ts:68`) |
| **AI streaming** (token-by-token from CLI providers) | `AiStreamPort.stream_text()`, Rust `ai/stream.rs` | Streams LLM responses as `AsyncIterable<AiStreamChunk>` |
| **AI prompt execution** (non-streaming) | `AiPort.execute()`, `AiService.execute()` | Full prompt → response for non-streamed queries |
| **AI prompt builder** (XML-tag section format) | `ai_prompt_builder.ts` | Pattern to adapt: wraps note content + similar notes + backlinks into structured prompts (`build_ai_prompt()`, `vault_context_sections()`) |
| **CLI provider integration** | `AiService`, provider configs (`ai_types.ts`) | Claude Code, Codex, Ollama already work for both streaming and execute |
| **Note content access** | Vault feature, `SearchPort.get_file_cache()`, MCP `read_note` | Fetch full note bodies for retrieved context |
| **Note links/backlinks** | `SearchPort.get_note_links_snapshot()` | Enrich context with link graph for cited notes |
| **Editor rendering** | ProseMirror/CodeMirror with wikilinks, KaTeX, Shiki | Renders assistant responses as rich markdown with clickable note links |
| **Tab/panel infrastructure** | `tab/`, `ui/` features | Chat panel opens as a dockable tab or sidebar panel |
| **MCP server** | `MCP tools/search.rs`, `tools/notes.rs` | Already exposes `search_notes` (text + semantic modes) and `read_note` — Phase 3 adds `rag_query` |
| **Reactive store pattern** | `AiStore` (`ai_store.svelte.ts`) | `RagStore` follows the identical `$state` reactive class pattern |

---

## Critical Difference from Existing AI Dialog

The current AI dialog (`AiService` + `AiStore`) is **single-document-centric**: the user asks about the currently open note, and vault context (similar notes, backlinks) is injected as supplementary material. The retrieval is opportunistic and secondary.

RAG Chat inverts this: the user's question **drives** retrieval across the entire vault, and the retrieved content is **primary** — it's the evidence the LLM reasons over. Every claim must cite its source. This is a different interaction model, a different prompt structure, and a different UI paradigm.

| Dimension | Existing AI Dialog | Vault RAG Chat |
|---|---|---|
| Scope | Single note + supplementary vault context | Full-vault retrieval, question-driven |
| Turns | Single turn (ask → answer → accept/reject) | Multi-turn conversation with history |
| Context source | "What note am I looking at?" | "What in my vault answers this question?" |
| Citation | None | Every claim cites a specific note |
| Output | Raw markdown (accept/reject into editor) | Rendered response with clickable source links |
| Streaming | Inline only (replace selection) | Full streaming chat with token-by-token rendering |
| Persistence | Ephemeral (lost on dialog close) | Sessions persisted to `.carbide/rag/sessions/` |

---

## New Feature Module: `src/lib/features/rag/`

Following Carbide's standard hexagonal anatomy (`index.ts` → `ports.ts` → `state/` → `application/` → `domain/` → `ui/`):

```
src/lib/features/rag/
├── index.ts                          # register actions, export public API
├── ports.ts                          # RagPort interface (thin — wraps SearchPort + AiPort)
├── state/
│   └── rag_store.svelte.ts           # ~150 lines — chat state
├── application/
│   ├── rag_service.ts                # ~300 lines — core RAG loop
│   ├── rag_actions.ts                # ~50 lines — action registration
│   └── rag_context_assembler.ts      # ~100 lines — token budget, dedup, truncation
├── domain/
│   ├── rag_types.ts                  # Message, Session, RetrievalResult, RagStreamEvent
│   └── rag_prompt_builder.ts         # ~100 lines — RAG-specific prompt construction
└── ui/
    ├── rag_panel.svelte              # ~200 lines — chat panel (tab/popover)
    ├── rag_message.svelte            # ~100 lines — message bubble with source citations
    └── rag_input.svelte              # ~100 lines — input + provider selector + scope filter
```

**Total: ~1200-1500 lines of new TypeScript/Svelte. Zero Rust. Zero new dependencies.**

---

## Component Detail

### 1. `rag_store.svelte.ts` (~150 lines)

Pattern-identical to `AiStore` (`src/lib/features/ai/state/ai_store.svelte.ts`). Uses the same `$state` reactive class convention.

```typescript
class RagStore {
  sessions: RagSession[] = $state([])
  active_session_id: string | null = $state(null)
  messages: RagMessage[] = $state([])
  is_streaming: boolean = $state(false)
  partial_message: string = $state("")       // streaming accumulation
  partial_citations: RagCitation[] = $state([])
  error: string | null = $state(null)
  provider_id: string = $state("claude")
  scope: RagScope | null = $state(null)       // folder/tag filter

  new_session(title?: string): void
  select_session(id: string): void
  delete_session(id: string): void
  add_user_message(content: string): void
  start_streaming(): void
  append_stream_chunk(chunk: RagStreamEvent): void
  finish_streaming(): void
  clear_error(): void
}

type RagMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  citations: RagCitation[]
  timestamp: number
}

type RagCitation = {
  index: number           // [1], [2], etc.
  note_path: string
  note_title: string
  snippet: string
}
```

### 2. `rag_service.ts` (~300 lines)

The core RAG loop. This is the only genuinely new logic — everything else is orchestration of existing ports.

```typescript
class RagService {
  constructor(
    private search_port: SearchPort,
    private ai_port: AiPort,
    private ai_stream_port: AiStreamPort,
    private vault_store: VaultStore,
    private rag_store: RagStore,
    private context_assembler: RagContextAssembler,
    private prompt_builder: RagPromptBuilder,
  ) {}

  async *query(input: {
    question: string,
    provider: AiProviderConfig,
    scope?: RagScope,
  }): AsyncGenerator<RagStreamEvent> {
    // STEP 1 — Retrieve
    // Call SearchPort.hybrid_search(question, limit: 15)
    // Apply scope filter (folder prefix or tag filter) post-retrieval
    const hits = await this.search_port.hybrid_search(
      vault_id, { raw: question, text: question, scope: "all" }, 15
    )

    // STEP 2 — Fetch full note bodies
    // For top 8 hits, read note content via vault/notes feature
    // Enrich with backlinks via SearchPort.get_note_links_snapshot()
    const contexts = await Promise.all(
      top_hits.map(hit => this.fetch_note_context(hit.note.path))
    )

    // STEP 3 — Assemble context with token budget
    // Deduplicate, sort by relevance, truncate to ~8K tokens
    const assembled = this.context_assembler.assemble(contexts, {
      max_tokens: 8192,
      conversation_history: this.rag_store.messages,
    })

    // STEP 4 — Build RAG prompt
    const { system_prompt, user_prompt } = this.prompt_builder.build({
      question: input.question,
      contexts: assembled,
      conversation_history: this.rag_store.messages,
      citation_map: assembled.citation_map,  // [1] → note_path, [2] → note_path
    })

    // STEP 5 — Stream response
    const citation_regex = /\[(\d+)\]/g
    let buffer = ""

    for await (const chunk of this.ai_stream_port.stream_text({
      provider_config: input.provider,
      system_prompt,
      messages: [{ role: "user", content: user_prompt }],
    })) {
      if (chunk.type === "text") {
        buffer += chunk.text
        // Parse citations from the stream
        let match: RegExpExecArray | null
        let last_index = 0
        while ((match = citation_regex.exec(buffer)) !== null) {
          // Emit text before the citation
          if (match.index > last_index) {
            yield { type: "text", text: buffer.slice(last_index, match.index) }
          }
          // Emit citation event
          const cite_index = parseInt(match[1])
          const cite = assembled.citation_map[cite_index]
          if (cite) {
            yield { type: "citation", index: cite_index, ...cite }
          }
          last_index = citation_regex.lastIndex
        }
        // Emit remaining text
        if (last_index < buffer.length) {
          yield { type: "text", text: buffer.slice(last_index) }
        }
        buffer = ""
      } else if (chunk.type === "done") {
        yield { type: "done" }
      } else if (chunk.type === "error") {
        yield { type: "error", error: chunk.error }
      }
    }
  }

  private async fetch_note_context(path: string): Promise<NoteContext> {
    // Read file content (existing vault feature)
    // Get metadata via SearchPort.get_file_cache()
    // Get backlinks via SearchPort.get_note_links_snapshot()
    // Return structured { path, title, content, blurb, backlinks }
  }
}

type RagStreamEvent =
  | { type: "text"; text: string }
  | { type: "citation"; index: number; note_path: string; note_title: string }
  | { type: "done" }
  | { type: "error"; error: string }
```

### 3. `rag_context_assembler.ts` (~100 lines)

Manages the context window. The critical constraint: we can't control the AI provider's context limit, so we must budget.

```typescript
class RagContextAssembler {
  assemble(contexts: NoteContext[], options: {
    max_tokens: number,
    conversation_history: RagMessage[],
  }): AssembledContext {
    // 1. Estimate token count for conversation history (chars / 4)
    // 2. Reserve tokens for system prompt (~500) + response (~2K)
    // 3. Remaining budget is for retrieved contexts
    // 4. Sort contexts by relevance score descending
    // 5. Truncate each note's content to fit proportionally
    // 6. Build citation_map: { 1: { note_path, note_title }, 2: ... }
    // 7. For follow-up turns, boost scores of notes cited in previous messages
    //
    // Returns: { context_blocks: ContextBlock[], citation_map: CitationMap, token_count: number }
  }
}

type ContextBlock = {
  index: number
  note_path: string
  note_title: string
  content: string       // truncated
  snippet: string       // the matching passage from search
  backlinks?: string[]  // linked note titles for additional context
}

type CitationMap = Record<number, { note_path: string; note_title: string }>
```

### 4. `rag_prompt_builder.ts` (~100 lines)

Adapts the existing `build_ai_prompt()` pattern (`src/lib/features/ai/domain/ai_prompt_builder.ts:39`) but is retrieval-first rather than document-first. Uses the same XML-tag section format (`<tag>\ncontent\n</tag>`).

```
System:
You are a knowledgeable assistant with access to a personal knowledge base of markdown notes.
Answer questions using ONLY the provided context. If the context does not contain the answer, say so.
Cite sources using [N] notation where N matches the source number below.
Format citations as markdown links when the note path is known.

<context>
[1] projects/carbide/architecture.md (Carbide Architecture):
Carbide follows a Ports & Adapters (Hexagonal) architecture with five layers...

[2] meetings/2026-06-01-planning.md (Planning Meeting):
Discussed the RAG implementation timeline. Key decisions: use hybrid search...
</context>

<conversation_history>
User: What architecture pattern does Carbide use?
Assistant: Carbide uses a Ports & Adapters (Hexagonal) architecture [1].
</conversation_history>

User: Why was that pattern chosen?
```

Implementation:

```typescript
class RagPromptBuilder {
  build(input: {
    question: string,
    contexts: ContextBlock[],
    conversation_history: RagMessage[],
    citation_map: CitationMap,
  }): { system_prompt: string; user_prompt: string } {
    // System prompt: role + citation instruction
    // Context section: each block as <source index="N" path="...">content</source>
    // Conversation history: last N turns (budgeted)
    // User message: the current question
    // Follows the same section(label, value) pattern as ai_prompt_builder.ts
  }
}
```

### 5. `rag_panel.svelte` (~200 lines)

Chat panel displayed as a tab or sidebar panel. Reuses existing shadcn-svelte components (Button, ScrollArea, Separator).

Key states:
- **Empty** — "Ask anything about your vault" placeholder, example questions
- **Loading** — Retrieval indicator ("searching 842 notes..."), then streaming response
- **Active** — Message list with user bubbles (right) and assistant bubbles (left)
- **Error** — Error message with retry button

Features:
- Auto-scroll to bottom on new messages
- Typing indicator during streaming (animated dots)
- Session list in header (dropdown to switch/rename/delete sessions)
- "New chat" button to start fresh session
- Provider selector in header

### 6. `rag_message.svelte` (~100 lines)

Renders a single message bubble.

For **user messages**: right-aligned, plain text, timestamp.

For **assistant messages**: left-aligned, rendered as rich markdown via ProseMirror or a markdown renderer. Source citations appear as clickable badges below the message body:

```
┌────────────────────────────────────────────┐
│ Carbide uses a Ports & Adapters            │
│ architecture with five layers: Ports +     │
│ Adapters, Stores, Services, Reactors,      │
│ and Action Registry.                       │
│                                            │
│ Sources:                                   │
│ [1] projects/carbide/architecture.md  →    │
│ [2] docs/design-decisions.md          →    │
└────────────────────────────────────────────┘
```

Clicking `[1]` opens `projects/carbide/architecture.md` in a new editor tab.

During streaming, shows partial markdown with a blinking cursor at the end.

### 7. `rag_input.svelte` (~100 lines)

- Text area with auto-resize (single line → expands to 4 lines)
- Send button (or Enter to send, Shift+Enter for newline)
- Provider/model selector (popover dropdown)
- Optional scope filter (folder selector, tag picker)
- Disabled during streaming

### 8. Actions (~50 lines in `rag_actions.ts`)

```typescript
// Registered in action_registry:
// rag.open              → open RAG panel in sidebar/tab
// rag.ask_selection     → pre-fill input with selected editor text
// rag.new_session       → start a fresh conversation
// rag.clear_session     → clear current conversation
// rag.toggle_panel      → show/hide RAG panel
```

Wire into `register_rag_actions()` called from `register_actions()` at boot, following the same pattern every other feature uses.

### 9. `ports.ts` (~30 lines)

Thin interface — almost all implementation delegates to existing ports:

```typescript
interface RagPort {
  retrieve(query: string, vault_id: VaultId, limit: number): Promise<RetrievalResult[]>
  // Wraps SearchPort.hybrid_search() with scope filtering
  read_notes(paths: string[]): Promise<Map<string, NoteContent>>
  // Batch read via existing vault/notes feature
}
```

---

## What Does NOT Change

- **Zero Rust code** — every Tauri command needed already exists (`search_notes`, `read_note`, AI execute/stream, file I/O)
- **Zero new IPC** — `AiPort`, `AiStreamPort`, `SearchPort`, `WorkspaceIndexPort` cover the full surface
- **Zero embedding/index changes** — BGE-small + hnsw_rs + RRF is the correct retrieval backend
- **Zero new dependencies** — no npm packages, no Cargo crates
- **Zero MCP changes** (Phase 1-2) — existing `search_notes` + `read_note` tools are sufficient; a `rag_query` MCP tool can be added in Phase 3

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Chat history persistence** | JSON files in `.carbide/rag/sessions/<uuid>.json` | Simpler than SQLite; markdown-native; human-readable |
| **Retrieval strategy** | `hybrid_search()` — FTS5 + vector + RRF | Already implemented, proven, returns scored + snippet-annotated hits |
| **Context window budget** | 8K tokens for context, reserve 2K for response | Conservative default; configurable per provider |
| **Citation format** | `[N]` notation in LLM output, parsed in stream, rendered as wikilinks | Standard convention, simple regex parsing, maps to existing `[[link]]` infrastructure |
| **Conversation scope** | Vault-wide (default), folder/tag filter (optional) | Start simple; scoping adds retrieval filtering with no new infrastructure |
| **Follow-up coherence** | Re-retrieve per message, boost scores of previously cited notes | Avoids stale context; citation boost keeps topic thread without complex state |
| **Provider selection** | Reuses existing `AiProviderConfig` with provider dropdown | Identical to current AI dialog provider selection |
| **Streaming interleaving** | Parse `[N]` inline, emit structured events (`text` \| `citation` \| `done` \| `error`) | Clean separation of concerns; UI renders each event type appropriately |
| **MCP exposure** (Phase 3) | `rag_query` tool calls the same `RagService.query()` path | No duplication; external agents get the same retrieval quality as in-app users |

---

## Phased Build Plan

### Phase 1 — Core Loop (2-3 sessions)

**Goal:** Open chat → ask question → get cited answer → click citation to open note.

**Deliverables:**
- `rag_store.svelte.ts` (state management)
- `rag_types.ts` (type definitions)
- `rag_prompt_builder.ts` (prompt construction)
- `rag_context_assembler.ts` (token budget + dedup)
- `rag_service.ts` (retrieve → assemble → prompt → execute)
- `rag_actions.ts` (action registration)
- `rag_panel.svelte` (minimal panel — question input + response display with clickable citations)
- `rag_input.svelte` (input field + send button + provider selector)

**What's deferred:** Multi-turn conversation history, streaming, session persistence, scope filtering, UI polish.

### Phase 2 — Conversation + Polish (2 sessions)

**Goal:** Full chat experience with history, streaming, and session management.

**Deliverables:**
- Multi-turn conversation with history injection into prompts
- Streaming token-by-token with `rag_message.svelte` typing indicator
- Session persistence (`.carbide/rag/sessions/`)
- `rag_message.svelte` (rendered markdown, citation badges)
- Scope filtering (folder prefix, tag filter)
- Session list UI (new, rename, delete, switch)
- Empty state with example questions

### Phase 3 — Power Features (1-2 sessions)

**Goal:** External access and advanced retrieval.

**Deliverables:**
- MCP `rag_query` tool — external agents (Claude Code, Claude Desktop) query the vault conversationally
- MCP `rag_status` tool — check model availability, index health
- Embedding reuse for conversational coherence (cache query embedding, boost next query by similarity to previous)
- Saved prompt templates ("summarize folder", "find contradictions", "extract action items")
- @mention in input to pin specific notes as forced context (bypasses retrieval for those notes)

---

## Integration Points Summary

```
User asks question
       │
       ▼
RagPanel ──► RagService.query()
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
  SearchPort   VaultStore   AiStreamPort
  .hybrid_     (read note    .stream_text()
  search()      content)
       │           │           │
       ▼           ▼           ▼
  Rust hybrid  Rust file    Rust AI
  search        I/O          stream
  (existing)    (existing)   (existing)
       │           │           │
       └───────────┼───────────┘
                   ▼
           RagContextAssembler
           (dedup, budget, sort)
                   │
                   ▼
           RagPromptBuilder
           (system + context + history + question)
                   │
                   ▼
           LLM streams response
                   │
                   ▼
           Citation parser extracts [N]
                   │
                   ▼
           RagPanel renders message
           with clickable source links
```
