---
"carbide": minor
---

HTML embedded in a note is now Safe by default. A `![[x.html]]` transclusion and a ` ```html ` fence both render with scripts and network access disabled until you ask otherwise, and each carries a Safe/Live switch on its toolbar.

Switching to Live asks for a trust grant the first time — per embedded file, or per note for a fence (either file or folder scope, the same dialog the HTML tab uses). Once granted, the document runs in an isolated frame with no access to the app. The choice is written into the markdown (` ```html live ` and `![[x.html#mode=live]]`), and it stays gated: revoke the grant and the surface falls back to Safe instead of running.
