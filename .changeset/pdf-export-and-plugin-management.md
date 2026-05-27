---
"carbide": minor
---

### Features

- **Note PDF export rework**: Replaced the old in-app PDF engine with a self-contained HTML renderer plus a `PdfExportPort`/Tauri adapter and an `export_html_to_pdf` command that captures HTML to PDF natively on macOS, Windows, and Linux. Export now routes through `DocumentService`, with mermaid diagrams, math fences (rendered as centered italic text with inline KaTeX CSS), and SVG-to-PNG rasterization supported.
- **Plugin management**: Added marketplace update support and plugin uninstall, plus an `md-export` PDF plugin.

### Fixes

- **macOS PDF export**: Paginate output via `NSPrintOperation` and avoid the WKWebView print deadlock by running `runOperationModalForWindow` asynchronously.
- **Plugin install**: Allow subdirectory paths in plugin filenames during install, and use camelCase `downloadUrl` to match the Rust serde `rename_all` casing.
- **Rendering**: Fixed h1 underline position and full-width HR in the plugin.
- **UI**: Made toast text selectable.
