---
"carbide": patch
---

Make unhandled errors diagnosable and stop one of them at its source. The global error handler logged only the message, dropping the stack — the only part that identifies the call site — so "There is no position before the top-level node" was untraceable in carbide.log. Errors and rejections now log their stack alongside the message (the toast stays message-only), and the image context menu no longer asks ProseMirror for a position before the document node when a click resolves at the top level — the crash that produced that exact message. Replacing a paragraph with a code block likewise no-ops instead of throwing when the selection has no textblock parent.
