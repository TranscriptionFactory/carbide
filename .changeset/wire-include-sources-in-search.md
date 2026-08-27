---
"carbide": patch
---

Make "Include Sources in Search" do something. The setting shipped declared but unread, so linked reference sources (PDFs, HTML) always appeared in search results while semantic similarity always excluded them. It now gates both, plus search-graph edges, and has a toggle in Settings → Toolchain → Reference Manager. With it on (the default) the Related panel, AI vault context, and search-graph expansion now surface linked sources alongside vault notes.
