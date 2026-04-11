---
"carbide": minor
---

### New Features

- **HTML viewer for linked sources:** View linked source files and vault files in an HTML viewer, wired up with proper rendering
- **Embedding toggle controls:** Disable/enable embedding per-source via settings UI toggle switches and command palette actions
- **STT feature-gated:** Speech-to-text subsystem gated behind `stt` Cargo feature flag, removed from default main build to reduce binary size and compile times

### Fixes

- **Editor:** Catch ProseMirror position errors in `dispatchTransaction` to prevent silent crashes
- **Vault sync:** Preserve linked source content during vault sync instead of overwriting
- **Performance:** Defer linked source embedding to batch path; reduce CPU spike when adding linked source folders; stop embedding from blocking the writer thread
- **UI:** Fix FolderSuggestInput trailing slash and nested path bugs
- **STT stability:** Prevent CoreAudio SIGSEGV, fix model loading blocking the async runtime, prevent transcription spinner from hanging, correct VAD model resource path
- **Deps:** Pin `tauri-plugin-dialog` to 2.6.0
- **CI:** Switch `generate-bindings` to macOS for `ort_sys` linker fix; make candle accelerate feature macOS-only for Linux builds
