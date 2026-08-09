# Editor Stack & Frontend Simplification Research

> Date: 2026-03-25
> Scope: Simplification strategies, framework alternatives, WYSIWYG architecture options, and editor library landscape evaluation

---

## Context

Investigation into whether the current Tauri + SvelteKit + ProseMirror stack can be simplified or replaced, motivated by:

- Desire for battle-tested, developer-friendly foundations (vim keybindings, LSP integration)
- Exploring whether LSPs could replace tags/todos/linking subsystems
- A moonshot idea: reimplement WYSIWYG on Helix-like architecture instead of Tauri webapp
- General complexity reduction across the frontend

---

## Codebase State (as of this date)

**Stack:** Tauri 2 (Rust) + SvelteKit 5 + Raw ProseMirror + CodeMirror 6 + Svelte 5 runes
**Scale:** 487 TS files, 221 Svelte components, 46 reactors, 30+ feature slices
**Editor:** `prosemirror_adapter.ts` (1,328 lines), 47 raw PM plugins

**Post-Milkdown-ejection state:** The codebase already ejected Milkdown → raw ProseMirror (see `implementation/milkdown_ejection.md`, `archive/research/milkdown_role_assessment.md`). The ejection removed a coupling-risk intermediary and gave direct PM API control. That decision was correct — the problem was Milkdown's framework coupling, not remark itself.

**Parser re-evaluation:** The ejection incidentally replaced remark (AST-based) with markdown-it (token-based) for speed. On reflection, AST-based parsing is the better fit for this application: ProseMirror's document model is a tree, LSP operates on semantic positions, and embedding/search/linking all benefit from a queryable syntax tree. The speed difference is irrelevant — parsing happens on file open and paste, not per-keystroke. Adopting `remark-parse` / `remark-stringify` as the markdown ↔ mdast pipeline (without Milkdown's framework layer) gives a shared intermediate representation that the editor, LSP features, search indexing, and link extraction can all consume.

**Complexity drivers:**

1. 47 raw PM plugins without clear internal organizational pattern
2. Tri-LSP architecture (IWE + Lint + CodeLSP) — three separate service/port/adapter stacks converging on DiagnosticsStore
3. Dual editor (ProseMirror + CodeMirror 6) — mode switching, split view sync
4. 46 reactors, some of which exist to paper over architectural complexity

---

## A) Simplification Strategies

### 1. Consolidate the Tri-LSP Architecture

Three separate LSP systems (IWE, Lint, CodeLSP) publish independently to DiagnosticsStore via separate service/port/adapter stacks. There is no conflict resolution, no diagnostic priority, unclear feature ownership boundaries, and a multiplexer reactor (`lsp_document_sync.reactor`) fanning out to all three.

**Recommendation:** Single LSP client abstraction managing multiple language server connections. Diagnostic merging already happens in DiagnosticsStore — the problem is the three separate stacks above it.

**Replace IWE with Marksman:** Marksman is a production Rust markdown LSP that handles wikilink completion, resolution, broken link diagnostics, and cross-vault backlink tracking natively. IWE (`iwe_service.ts`) is 200+ lines with auto-restart logic, lifecycle queues, and a vendored server. Marksman + a thin adapter replaces it entirely.

### 2. Tags/Todos via LSP

Custom LSP servers can expose:

- **Tags** as document symbols (`textDocument/documentSymbol`) — `#tag` in any note becomes a symbol
- **Todos** as diagnostics with `Hint` severity or code lens (`textDocument/codeLens`)
- **Cross-note queries** via workspace symbols (`workspace/symbol`)

This is the same protocol Marksman uses for links. A small custom LSP (or Marksman extension) handles the metadata layer without a bespoke feature slice. The `tags` and `task` feature slices become protocol consumers, not custom implementations.

### 3. Adopt remark/mdast as the Markdown Pipeline

Replace markdown-it with `remark-parse` → mdast → PM doc (and reverse: PM doc → mdast → `remark-stringify`) as the canonical markdown pipeline. This is **not** re-adopting Milkdown — it is using remark as a library, with no framework intermediary controlling the PM instance.

**Why AST over tokens for this application:**

| Concern             | Token-based (markdown-it)                | AST-based (remark/mdast)                             |
| ------------------- | ---------------------------------------- | ---------------------------------------------------- |
| PM conversion       | Tokens → implicit tree rebuild           | Tree → tree mapping (natural)                        |
| LSP integration     | Must reconstruct structure               | Semantic positions directly available                |
| Search/embeddings   | Stateful accumulator to chunk by heading | `unist-util-visit` traversal                         |
| Link extraction     | Regex or token scanning                  | Visit all `link`/`wikiLink` nodes                    |
| Round-trip fidelity | Tokens lose structural nuance            | Tree preserves nesting, reference defs               |
| Speed               | ~2-5x faster raw parse                   | Irrelevant — parsing is file-open, not per-keystroke |

**Implementation:** The `markdown_pipeline.ts` (589 lines) and `schema.ts` (736 lines) already define the PM schema and serialization rules. The migration replaces the markdown-it tokenizer/renderer with remark-parse/stringify while keeping the PM schema and node mappings intact. The mdast intermediate becomes available to LSP, search, and link subsystems without redundant parsing.

**Licensing:** remark-parse and remark-stringify are MIT (unified collective, Titus Wormer). 10M+ weekly npm downloads. Stable — `v11.0.0` since Sep 2023, in maintenance mode. Single-maintainer risk mitigated by MIT license and wide adoption (Next.js, Gatsby, Docusaurus, Prettier, MDX).

### 4. Organize the 47 PM Plugins

The PM ejection from Milkdown was the right call. The remaining work is applying Moraya's organizational pattern (`schema.ts` / `markdown_pipeline.ts` / `setup.ts`) to eliminate redundancy and create clear colocation of schema, serializer, and plugin per node type. This is internal refactoring — no new dependency.

### 5. Cut Peripheral Features (If Not Daily Use)

Canvas (Excalidraw), terminal, and bases are high-effort to maintain. Each is ~1-2 weeks to remove cleanly if they're not core daily-use features.

### 6. Yjs for Cross-Mode Document Sync

Replace the hand-rolled PM ↔ CM6 sync (markdown serialize → store → parse round-trip, mediated by `editor_sync`, `split_view_content_sync`, and related reactors) with Yjs as a shared document model.

**Current sync path:**

```
PM edit → serialize to markdown → update store → reactors fire → parse markdown → CM6 state
```

Lossy (whitespace/formatting edge cases), latent (full doc re-parse), requires ~6-8 reactors for dirty state, cursor preservation, scroll position, and debouncing.

**Yjs sync path:**

```
Y.Doc (shared CRDT)
  ├── y-prosemirror binds PM EditorState to Y.XmlFragment
  └── y-codemirror.next binds CM6 EditorState to Y.Text
```

Both editors operate on the same in-memory document. Mutations propagate via Yjs observer protocol — no serialization round-trip for sync. `Y.UndoManager` provides scoped undo/redo that respects both editors.

**What collapses:** ~6-8 sync/coordination reactors, manual debounce logic, mode-switch serialization. Split view becomes trivial — both panes bind to the same Y.Doc.

**What it does NOT replace:** PM plugin organization, LSP architecture, remark pipeline (still needed for file I/O: disk → remark-parse → mdast → PM doc / Y.Doc, and reverse for save).

**Licensing:** Yjs is MIT (Kevin Jahns), 21.5k GitHub stars, 1M+ npm downloads/week. `y-prosemirror` and `y-codemirror.next` are both MIT. Production users: Evernote, GitBook, JupyterLab, AFFiNE. Single-maintainer risk mitigated by MIT license, wide adoption, and v14 active development (rc.6 as of this date).

**Future upside:** Yjs also buys crash recovery (persist Y.Doc to IndexedDB), undo history, and a path to real-time collaboration if ever needed — at no additional architectural cost.

### 7. Reduce Reactors

Several reactors exist to handle WYSIWYG mode sync and split-view coordination. With Yjs handling cross-mode sync (§A.6), ~6-8 sync reactors collapse directly. Additional reactor reduction comes from LSP unification (§A.1).

---

## B) Framework Assessment

### Tauri 2 — Keep

Not the problem. Lightweight, correct, native IPC, file system, system tray, updater. The Rust backend is genuinely thin and well-abstracted. Do not touch.

### SvelteKit — Optional to Remove

SvelteKit's routing adds complexity for a desktop SPA with no server-side rendering. The static adapter setup and routing layer serve no real purpose. A raw Svelte 5 + Vite setup would be simpler. Minor gain, not urgent.

### Helix Editor Moonshot — Assessment

Helix has no GUI mode and no plans for one. The appeal is its architecture: tree-sitter, LSP-native, modal editing, Rust. The actual equivalent would be:

- GPU-accelerated text rendering (GPUI from Zed, now open source; or Floem from Lapce)
- Tree-sitter for syntax
- LSP-first for all intelligence
- Vim/Helix keybindings at native layer
- No web runtime

**Honest assessment:** 9-12 month rewrite minimum. GPUI is production-quality (Zed uses it) but has steep learning curve and thin ecosystem. Xilem (Linebender) is more principled but pre-stable. Floem is simpler but less capable.

The pragmatic version of this moonshot: stay on Tauri, add vim keybindings to CodeMirror 6, move intelligence to LSP servers. 80% of the experience, 20% of the rewrite cost.

---

## C) WYSIWYG Architecture Options

**Constraint: WYSIWYG is non-negotiable.** Assessment of options given this constraint.

### Option 1: CM6 Live Preview (Path of Least Resistance)

CodeMirror 6's decoration system can implement Typora/Obsidian-style live preview:

- `Decoration.replace()` — hides markdown syntax markers, shows styled widgets
- `Decoration.widget()` — inserts rendered elements (images, KaTeX, tables)
- `Decoration.mark()` — applies CSS (bold/italic/heading size)

The editing model stays as markdown source. When cursor is on `**text**` you see markers; when it leaves, CM6 replaces with a styled widget. Uses `@lezer/markdown` (already in CM6's markdown extension) for the parsed tree — no separate parser.

**Gives you:** WYSIWYG feel + vim keybindings (`@replit/codemirror-vim`) + LSP diagnostics (CM6 lint already integrated) + eliminates ProseMirror entirely. Still Tauri, no rewrite.

**Not applicable here** because the WYSIWYG requirement is for full rich editing, not live-preview markdown — but worth noting as an option if requirements shift.

### Option 2: GPUI Block Editor (Zed Architecture, True Native)

Full Rust-native approach using GPUI (Zed's framework, open source):

```rust
enum Block {
    Paragraph(Vec<Inline>),
    Heading { level: u8, inlines: Vec<Inline> },
    CodeBlock { lang: String, content: String },
    Image { src: PathBuf, alt: String },
    Table { rows: Vec<Vec<Vec<Inline>>> },
}
```

Each block maps to a GPUI element. Headings render large, bold renders weight 700, images upload as GPU textures. Cursor moves through semantic positions in the tree, not character offsets — same model as ProseMirror, but in Rust/GPU.

**The brutal truth:** Correct cursor positioning, selection, IME composition, undo/redo, and clipboard in a custom block editor takes 6-9 months of focused work even with GPUI's primitives. This is the Zed-architecture answer but it is a substantial undertaking.

**Rust GUI framework comparison:**

| Framework     | Status     | Notes                                |
| ------------- | ---------- | ------------------------------------ |
| GPUI (Zed)    | Production | Most capable, complex API            |
| Floem (Lapce) | Active     | Simpler, good text primitives        |
| Iced          | Stable     | Elm-inspired, easier, less low-level |
| Xilem         | Pre-stable | Most principled, not ready           |

### Option 3: Hybrid (GPUI Shell + WebView Editor)

GPUI for all chrome (sidebar, graph, panels, tabs) + WebView only for editor content. Conceptually similar to VS Code's webview panels, inverted. In practice this is Tauri with a different outer shell — IPC boundary just moves. Not worth the complexity unless there's a specific reason to want GPU-rendered chrome.

### Current Recommendation

**Keep ProseMirror as the WYSIWYG engine.** ProseMirror is the right foundation — battle-tested (Notion, Linear, Atlassian, GitHub), MIT licensed, maintained by Marijn Haverbeke, most capable WYSIWYG available. The problem is not the engine; it is the 47 plugins without internal organizational structure.

---

## D) Editor Library Landscape

### Tiptap

ProseMirror with a clean extension API on top. Same rendering, same schema model, same WYSIWYG quality.

**Analysis:** Would collapse ~30 of 47 plugins into maintained upstream extensions. Migration confined to `prosemirror_adapter.ts` (EditorPort abstraction already isolates PM). 3-week bounded migration.

**Why it was rejected:** The Milkdown ejection happened for exactly the same reasons you'd eventually eject Tiptap — intermediary layer, coupling risk, re-export indirection, two mental models. Tiptap is MIT for the core and free extensions, but that doesn't change the architectural argument. Going to Tiptap would be regressing on the ejection rationale.

**Licensing note:** Tiptap core (`@tiptap/core`) and standard extensions are MIT. Only the hosted cloud services (collaboration, comments, AI endpoints, export) are proprietary — none of which would be used in a local-first app. The lock-in risk is real but shallow (thin layer over PM, clear eject path).

### Milkdown

Already ejected. Off the table. See `implementation/milkdown_ejection.md` and `archive/research/milkdown_role_assessment.md` for full rationale.

**Key ejection reasons:**

- Only provided bootstrapping, schema presets, and remark pipeline
- 22+ plugins already bypassed it via raw PM (`$prose()` wrappers)
- Milkdown as intermediary adds coupling risk with no capability gain
- Moraya reference implementation demonstrated clean replacement in ~1-2 days

**Revised assessment of remark:** The ejection incidentally dropped remark for markdown-it. The speed argument (AST vs token) is irrelevant for this application — parsing is file-open, not per-keystroke. remark/mdast is being re-adopted as a standalone pipeline (§A.3) for its tree-based intermediate representation, which naturally serves PM conversion, LSP, search, and link extraction. This is not a reversal — Milkdown (the framework) stays ejected; remark (the library) returns in a decoupled role.

### Lexical (Meta)

MIT, modern architecture. React-first in practice — Svelte bindings community-maintained and thin. Harder path despite being technically sound.

### Raw ProseMirror (Current)

The correct foundation. Every PM tutorial, Stack Overflow answer, and community extension applies directly. `prosemirror-*` packages have strong backwards-compat culture. The work is internal organization, not a library change.

---

## Conclusions & Priority Stack

| Priority | Change                                                                | Complexity         | Impact                                                                |
| -------- | --------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------- |
| 1        | Adopt remark/mdast pipeline (replace markdown-it)                     | Medium (2-3 wks)   | Shared AST for editor, LSP, search, links; better round-trip fidelity |
| 2        | Organize 47 PM plugins (Moraya pattern: schema.ts / pipeline / setup) | Medium (2-3 wks)   | Reduces `prosemirror_adapter.ts` ~1,328 → ~400 lines                  |
| 3        | Yjs for cross-mode sync (y-prosemirror + y-codemirror.next)           | Medium (2-3 wks)   | Collapses ~6-8 sync reactors, eliminates serialize round-trip         |
| 4        | Replace IWE with Marksman LSP                                         | Medium (2-3 wks)   | Eliminates vendored server, simplifies tri-LSP                        |
| 5        | Unify tri-LSP into single client abstraction                          | Medium (2-3 wks)   | Collapses 3 service stacks, reduces reactors                          |
| 6        | Tags/todos via LSP symbols/diagnostics                                | Medium (2-4 wks)   | Eliminates 2 feature slices                                           |
| 7        | Cut peripheral features if not daily use                              | Low (1 wk each)    | Removes Excalidraw/terminal/bases if applicable                       |
| 8        | Drop SvelteKit routing for raw Svelte 5 + Vite                        | Low (1 wk)         | Minor cleanup, not urgent                                             |
| 9        | Rust-native GUI (GPUI/Floem block editor)                             | Moonshot (9-12 mo) | Clean slate, maximum simplification                                   |

**The core finding:** The right simplification is completing what the Milkdown ejection started — but with two architectural upgrades that the ejection missed. First, re-adopting remark as a standalone AST pipeline (not a framework dependency) gives every subsystem (editor, LSP, search, links) a shared tree representation instead of each reconstructing structure independently. Second, Yjs as the shared document model for PM ↔ CM6 sync replaces hand-rolled reactor coordination with a battle-tested CRDT binding layer. Combined with PM plugin organization (Moraya pattern) and LSP unification, these changes address the real complexity drivers without replacing the engine (ProseMirror), the runtime (Tauri), or the language (Svelte 5).

---

## Implementation Progress

### Phase 1: Adopt remark/mdast pipeline ✅ COMPLETE (2026-03-25)

**Branch:** `feat/remark-mdast-pipeline`

**What was done:**

- Replaced markdown-it tokenizer with `remark-parse` → mdast → PM doc conversion (`mdast_to_pm.ts`, 335 lines)
- Replaced `prosemirror-markdown` MarkdownSerializer with PM doc → mdast → `remark-stringify` conversion (`pm_to_mdast.ts`, 343 lines)
- Created custom remark plugins for `==highlight==` syntax (`remark_highlight.ts`) and `<details>` blocks (`remark_details.ts`)
- Assembled unified processor with remark-gfm (tables/strikethrough/task lists), remark-math ($/$$/), remark-frontmatter (YAML), remark-gemoji (emoji shortcodes) (`remark_processor.ts`)
- `markdown_pipeline.ts` reduced from 589 lines → 27-line facade
- New exports: `parse_to_mdast()` and `pm_to_mdast()` for LSP/search/links consumers
- Removed `prosemirror-markdown`, `markdown-it-emoji`, `markdown-it-front-matter`, `markdown-it-texmath` dependencies
- Retained `markdown-it` and `@types/markdown-it` (still used by `pdf_export.ts`)

**Files created:**

- `src/lib/features/editor/adapters/mdast_to_pm.ts`
- `src/lib/features/editor/adapters/pm_to_mdast.ts`
- `src/lib/features/editor/adapters/remark_plugins/remark_processor.ts`
- `src/lib/features/editor/adapters/remark_plugins/remark_highlight.ts`
- `src/lib/features/editor/adapters/remark_plugins/remark_details.ts`

**Files deleted:**

- `src/lib/features/editor/adapters/markdown-it-emoji.d.ts`
- `src/lib/features/editor/adapters/markdown-it-texmath.d.ts`

**Validation:** 2536/2536 tests pass, 0 type errors, 0 new lint violations.

**Remaining cleanup:** `details_markdown_it_plugin.ts` is no longer imported by the pipeline but is kept for reference. Can be archived.

---

## Related Documents

- `implementation/milkdown_ejection.md` — Milkdown → ProseMirror migration plan
- `archive/research/milkdown_role_assessment.md` — Full Milkdown evaluation and ejection rationale
- `2026-03-23_integration_architecture_assessment.md` — Integration architecture assessment
- `docs/architecture.md` — Official architecture decision tree
