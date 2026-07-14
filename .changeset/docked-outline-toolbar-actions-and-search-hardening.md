---
"carbide": minor
---

Outline: docked mode renders the outline as a resizable pane beside the
editor with persisted width; the active heading follows the editor cursor
and scroll position, with the panel keeping the active item in view and
heading clicks centering the target; level-aware typography, indent
guides, truncation tooltips, and a sliding accent marker with
aria-current; alt-click on a chevron folds the section in the editor;
scroll-spy geometry recomputes on editor resize and content growth, and
scroll-spy/navigation are suppressed in source mode where positions are
meaningless.

Editor: link and image toolbar buttons are functional — URL popover
(Mod-k) with edit/remove for existing links, image insertion through the
vault asset pipeline — and all toolbar buttons now reflect the caret's
real block type and disable where commands can't apply, with
platform-aware shortcut tooltips; the floating table toolbar tracks
scroll/resize via floating-ui autoUpdate; suggest dropdowns no longer
flash at the viewport origin on first open and defer until the cursor DOM
is laid out; note embeds handle missing targets gracefully and heal when
the target note is created.

Links: insert-link buttons on backlinks, related notes, and RAG citations
insert [[Title]] at the cursor; the context rail no longer closes when
clicking into the editor.

Query DSL: symbolic property operators (=, !=, >, <) now map to bases
operators so range filters like created > "now()-15d" return results;
builtin date properties and now() values appear in autocomplete.

AI/RAG: inline AI stream errors preserve partial output and restore
deleted selections, aborts propagate to the backend, and execution can't
double-trigger; RAG retrieval limit and context token budget are real
settings, and changing the embedding model triggers the promised clear
and re-embed; RAG chat renders markdown with honest readiness and scope
hints; MCP search states when semantic mode degraded to keyword-only,
stops exposing inverted raw BM25 scores, and rescales the title boost so
fusion ranks correctly.

Search/indexing: embedding toggles actually gate per-save and batch
embedding, changed-section invalidation runs unconditionally, status
reports real worker activity, query paths never download models
synchronously, and storage reconciles changed vectors after unclean
exits; rebuild flows show visible progress, toasts, and busy states, with
embedding progress mirrored into the status bar.
