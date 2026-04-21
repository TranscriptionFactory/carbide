---
"carbide": minor
---

### Welcome onboarding dialog

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
