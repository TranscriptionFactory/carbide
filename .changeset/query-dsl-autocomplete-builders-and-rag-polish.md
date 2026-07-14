---
"carbide": minor
---

Query DSL: grammar-aware autocomplete for the notes and task query DSLs —
in query/base code blocks (scoped to their blocks only), the task panel
textarea, and the query panel — plus visual query builders that emit DSL
text, mounted behind panel/DSL-mode toggles, and an omni-query dialog with
a Build query… command action.

AI/RAG: indexing banner with readiness-aware placeholder and rotating
example prompts, generating stage showing the provider name with a stop
control, provider/stream errors normalized into readable messages, AI
provider status badges with a Test button and tri-state CLI availability
in settings, CLI resolution via a tilde/PATH/login-shell cascade, and
current-note images now sent along on both chat surfaces.

Graph: search-tuned forces with label-aware collision and real
convergence, percentile-based zoom-to-fit on new snapshots with a legible
initial view, label truncation, and an expand-graph toggle that collapses
the result list.

Editor: keyboard-accessible drag handle and insert button with snapped
drop indicator, section-drag badge, and offscreen-handle culling; ghost
placeholder hint on empty docs; scroll-jump and scroll-fighting fixes;
table layout, callout title, and fold state persist through markdown; Tab
moves between table cells; pasted images no longer overwrite existing
assets.

Accessibility and UI: polite live-region announcer wired to toasts and RAG
progress, forced-colors and print media styles, themed caret, and
keyboard-navigable omnibar vault headers.

Build: CodeMirror chunk kept out of startup modulepreload, KaTeX fonts
shipped woff2-only, git2 trimmed to no-default-features without vendored
OpenSSL, and unused pdfkit/blob-stream/isomorphic-git dependencies
dropped.
