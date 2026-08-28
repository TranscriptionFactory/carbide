---
"carbide": patch
---

Stop the per-line `[lsp stderr]` WARN flood. Every stderr line from a language server was logged at WARN, so a server repeating one problem (Marksman "Document not found", liwe frontmatter bursts) produced dozens of identical warnings per session. The first occurrence of a distinct line (timestamps/level markers normalized away) still warns, repeats log at DEBUG, and a `N distinct / M total` summary is logged when the process's stderr closes.
