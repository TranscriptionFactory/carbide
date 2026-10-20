---
"carbide": minor
---

New opt-in setting, Settings → Semantic → Rerank AI Context Retrieval, re-scores the notes the assistant and MCP tools retrieve with a small local cross-encoder model, so the notes handed to the AI answer the question more often. It downloads a ~90 MB model on first use and adds about a second per retrieval; until the model is ready, retrieval uses the existing ranking. Omnibar and search graph results are unchanged.
