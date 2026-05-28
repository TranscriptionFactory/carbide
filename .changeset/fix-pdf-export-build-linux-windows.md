---
"carbide": patch
---

### Fixes

- **PDF export build (Linux/Windows)**: Fixed Rust compile errors in `src-tauri/src/features/export/mod.rs` that broke the v1.44.0 release pipeline. Corrected the `webkit2gtk` trait import path (the crate has no `prelude` module) and dropped a vestigial `gtk::prelude::PrintSettingsExt` import since `PrintSettings::set` is inherent. On Windows, dropped a `BOOL::as_bool()` call now that `webview2-com`'s `PrintToPdfCompletedHandler` passes a plain `bool`.
