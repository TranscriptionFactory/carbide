---
"carbide": patch
---

fix(folder): close the gaps in OS drag-and-drop import

- **Drilldown mode accepts drops**: external file drops previously worked only in the tree file-tree mode; drilldown now handles them too, and recents/bases accept a container-level drop to the vault root.
- **Assets follow the drop target**: non-markdown files no longer all land in the vault-root attachment folder — a PDF dropped on `projects/` is now stored under `projects/`.
- **Dropping on a file row targets its parent folder** instead of falling back to the vault root.
- **Import results are reported**: imports now surface an "Imported N files, skipped M" toast instead of failing silently to the log.

Dropped directories continue to be skipped with a toast; recursive folder import is not included.
