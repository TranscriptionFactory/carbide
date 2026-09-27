---
"carbide": patch
---

Added a retrieval quality eval harness (`cargo test --lib retrieval_eval -- --ignored --nocapture`) that measures recall@1/3/5/10 and MRR, broken down by query type, across fts/vector/hybrid/blocks search over a synthetic 42-note fixture vault. No user-facing change.
