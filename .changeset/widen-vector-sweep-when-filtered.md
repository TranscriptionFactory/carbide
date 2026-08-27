---
"carbide": patch
---

Stop charging every semantic search for the linked-source filter. With "Include Sources in Search" off, hybrid search used to over-fetch vectors unconditionally — roughly 3x the graph traversal above the exact-search threshold — even in vaults holding a couple of linked PDFs. It now filters the normal sweep first and only re-searches wider when the survivors fall short of the requested limit, so hiding sources costs nothing until it actually thins the results.
