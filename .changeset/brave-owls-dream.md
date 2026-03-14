---
"badgerly": minor
---

Zen mode, native menubar, cache infrastructure, and backend hardening

- Zen mode: distraction-free writing toggle (Cmd+Shift+Enter) that hides sidebar panels with animated transitions; integrated into omnibar command palette
- Native macOS menu bar with app-specific items (File, Edit, View, Window, Help)
- LRU cache with observability for graph neighborhood queries (Rust, 64-entry) and Mermaid SVG rendering (TypeScript, 128-entry); tracks hits, misses, evictions, and hit rate
- Fix: settings service now uses atomic_write with fsync for crash-safe persistence
- Fix: watcher suppression replaced with consume-on-use tokens (eliminates race conditions)
- Fix: AI panel and task panel alignment at narrow viewport widths
