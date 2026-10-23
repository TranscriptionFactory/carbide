---
"carbide": patch
---

Web embeds now accept only `http:` and `https:` iframe sources. An `<iframe>` that points at a vault file or uses another scheme (`carbide-asset:`, `javascript:`, `data:`, `blob:`) stays as raw HTML source and is saved unchanged. Pasted iframes with these schemes are no longer embedded.
