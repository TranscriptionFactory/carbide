---
"carbide": patch
---

fix(graph): double-click opens notes; focus mode gets an exit everywhere

Double-click on a vault-graph node had been reassigned to focus mode while every other graph surface opened the note, leaving right-click "Open note" as the only (hidden) opener. Double-click now opens the note on all surfaces and "Focus node" lives in the context menu.

Focus-mode ergonomics: the graph tab shows the same "Focused / Exit focus" bar the sidebar had, and exiting re-runs the force layout instead of leaving nodes frozen in the radial arrangement. Restored graph tabs land on the vault view instead of an empty neighborhood screen, the view-mode button no longer cycles into the broken hierarchy error screen, the command palette gains "Open Vault Graph" (replacing the dead "Load Hierarchy" entry), and the semantic/smart-link toggles disable outside vault view.
