---
"carbide": minor
---

Add RAG-powered chat over the vault.

- Unified scope picker (folders · tags · bases) with suggestion navigation and lazy loading
- Deterministic query analysis: topic extraction plus date-range parsing, pushed into hybrid/block search as an mtime filter with scope over-fetch
- Section-granular hybrid retrieval, query rewriting, @mention pinned context, and inline citations
- Scope-aware prompt templates in the chat empty state
- MCP `rag_query` and `rag_status` tools via the front-end event bridge
- OpenAI-compatible API streaming with LM Studio and llama-server presets
- Authored/discovered link split in the right rail
- Smart blocks: unified insertion on the slash menu, and fixed a tasks-block XSS hole plus a reactivity gap
