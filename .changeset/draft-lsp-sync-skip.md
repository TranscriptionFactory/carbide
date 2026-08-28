---
"carbide": patch
---

Stop syncing draft notes into file-backed language servers. Draft scratchpads (`draft:…` paths) have no backing file, yet every debounced edit in one was sent as `textDocument/didChange` to Marksman and rumdl — servers that can never resolve it, answering with `Document not found` on stderr per keystroke batch. The markdown-LSP and lint sync clients now set `skip_draft`, and the sync reactor no longer records a skipped draft as the open document, which used to fire a phantom `didClose` for a file the server had never seen when you switched away.
