# badgerly

## 0.3.0

### Major Changes

- f289d9e: Edit/ask for AI assistants; graph & canvas views; new themes; Badgerly icon
- db5a9b5: Full-vault graph visualization and sqlite-vec semantic embeddings infrastructure

  **A1: Full-Vault Graph View**
  - Force-directed graph rendering of all vault notes using d3-force layout with SVG
  - New Rust command `graph_load_vault_graph` returning flat node + edge arrays with dedicated LRU cache
  - Viewport culling for efficient rendering at scale (up to 5000 nodes)
  - Graph view mode toggle between neighborhood and vault-wide views in GraphStore
  - New `VaultGraphCanvas` Svelte component with zoom, pan, and node interaction
  - Layout domain module with force simulation state management

  **B1: sqlite-vec Embeddings Infrastructure**
  - Embedding inference via `fastembed` crate with `bge-small-en-v1.5` (int8 quantized, 384-dim)
  - Vector storage via `sqlite-vec` extension with `vec0` virtual tables in existing per-vault SQLite DB
  - Hybrid search pipeline: FTS + vector KNN + Reciprocal Rank Fusion (k=60) with heuristic re-ranking
  - New Tauri commands: `semantic_search`, `hybrid_search`, `get_embedding_status`, `rebuild_embeddings`, `embed_sync`
  - Background embedding pipeline: batch processing (50 notes/batch) with progress events and cancellation
  - Graceful degradation when model or extension unavailable — FTS search continues unaffected
  - Frontend ports, adapters, and types for all embedding operations

### Minor Changes

- 68bae92: Zen mode, native menubar, cache infrastructure, and backend hardening
  - Zen mode: distraction-free writing toggle (Cmd+Shift+Enter) that hides sidebar panels with animated transitions; integrated into omnibar command palette
  - Native macOS menu bar with app-specific items (File, Edit, View, Window, Help)
  - LRU cache with observability for graph neighborhood queries (Rust, 64-entry) and Mermaid SVG rendering (TypeScript, 128-entry); tracks hits, misses, evictions, and hit rate
  - Fix: settings service now uses atomic_write with fsync for crash-safe persistence
  - Fix: watcher suppression replaced with consume-on-use tokens (eliminates race conditions)
  - Fix: AI panel and task panel alignment at narrow viewport widths
