---
"carbide": minor
---

Layout & shell: resizable 2-pane editor split with direction toggle,
persistence, and direction-aware drop-zone overlay; inbox recent-notes feed
with view switcher and Views/Types rail sections (live counts) folded into a
Bases mode tab; configurable activity bar and sidebar views with
command-palette access; status-bar quick-access icons for bottom panel tabs;
overlay titlebar with native vibrancy for glass themes and an always-present
macOS drag strip. Editor: "+" drag-handle button opening a block-type
dropdown, warm-neutral curated palette, typography-as-data spec, OK-easing
motion with AI-state indicators, and persisted HNSW search graph that skips
the 33s startup rebuild.

Fixes: window dragging and top-bar click regressions, dashboard/theater rails
and inbox virtualizer under the macOS drag strip, secondary split pane
receiving note content, bases sort keeping property-less notes at the end,
create-type input and hidden-type visibility, block-insert dropdown scroll
fighting hover, restored heading-level gutter markers, and reverted table
engine/edge-control regressions.
