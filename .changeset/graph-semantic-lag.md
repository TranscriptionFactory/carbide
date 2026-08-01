---
"carbide": patch
---

fix(graph): stop semantic edges from freezing the app on graph open

Opening the vault graph force-enabled semantic and smart-link edges for vaults up to 2000 notes and ran two synchronous O(n²) commands on the main thread, stalling the whole app — and re-enabled them after the user opted out. Inferred edges now compute only when their toggles are on, both commands run on a blocking worker thread (smart-links releases its DB locks between notes so concurrent searches are never starved), and the orphaned "Graph Auto-Edge Threshold" setting is removed.

Search-graph semantic edges are lazy too: the batch KNN runs only when the per-tab toggle is on, with results cached per tab and computed on demand when toggled later.

The frontend vault index also stops rebuilding wholesale on every note switch: a saved or externally changed note refreshes in place with a single read (saves are detected via the editor's dirty-to-clean transition; note add/remove still drops the index).
