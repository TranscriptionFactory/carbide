---
"badgerly": minor
---

Add semantic search integration with vault graph visualization

- Semantic similarity edges in vault graph with configurable threshold and edges-per-note settings
- WebGL renderer with worker-based force simulation and viewport culling for graph performance
- Batch semantic KNN via single IPC call with pure Rust backend (replacing sqlite-vec)
- Streaming vault graph backend with granular neighborhood cache invalidation
- Semantic omnibar fallback for search
- Suggested links panel with reactor-driven refresh
- Configurable semantic embedding parameters in settings
- Graph as a first-class tab type with dedicated graph tab view and tab persistence
- Renderer refactored with Svelte action-based canvas lifecycle for reliable mount/cleanup
- Fix Svelte reactive array deproxying before postMessage to web workers
- Fix worker postMessage clone errors and URL resolution
