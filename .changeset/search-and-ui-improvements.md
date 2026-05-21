---
"carbide": minor
---

### Features

- **Collapsible section in Turn Into menu**: Added collapsible grouping to the block Turn Into menu for better organization.

- **Fuzzy matching in graph filter**: Graph filter now uses fuzzy matching for more forgiving node search.

- **Continuous semantic neighbor scoring**: Semantic neighbor results use continuous similarity scoring instead of binary thresholds, improving relevance ranking.

### Fixes

- **Hybrid search RRF merge**: Pure-vector hits are now included in the Reciprocal Rank Fusion merge, fixing cases where semantically relevant results were dropped.

- **Task query view**: Fixed section display, optimistic toggle behavior, and doing state rendering in task query results.

- **Round-trip doing task state**: The `[-]` (doing) task state now correctly round-trips through the editor without being lost or corrupted.
