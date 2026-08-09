# Plan: Archive STT and Remove from Main

## Step 1: Create archive branch

```
git branch archive/stt-main   # snapshot current HEAD with all STT code
```

## Step 2: Delete STT-only files (on main)

**Frontend (10 files):**

- `src/lib/features/stt/` (entire directory — 7 files)
- `src/lib/reactors/stt_init.reactor.svelte.ts`
- `src/lib/reactors/stt_settings_sync.reactor.svelte.ts`
- `tests/unit/reactors/stt_settings_sync_reactor.test.ts`

**Backend (7 files):**

- `src-tauri/src/features/stt/` (entire directory — mod.rs, types.rs, audio.rs, vad.rs, transcription.rs, models.rs, text.rs)

**Resources:**

- `src-tauri/resources/models/silero_vad_v4.onnx`

## Step 3: Remove STT dependencies from `src-tauri/Cargo.toml`

- Remove `cpal`, `rubato`, `rustfft`, `hound`, `vad-rs`, `strsim`, `natural`, `transcribe-rs`, `rodio` deps
- Remove `stt` feature definition and platform-specific transcribe-rs overrides
- Keep `candle-*` and other non-STT deps

## Step 4: Comment out STT wiring in integration points

These files have non-STT code but contain STT imports/registrations that should be **commented** (not deleted), per user request:

1. `src/lib/app/di/app_ports.ts` — SttPort import + `stt: SttPort` field
2. `src/lib/app/di/create_app_context.ts` — `register_stt_actions` call
3. `src/lib/app/create_prod_ports.ts` — `create_stt_tauri_adapter` import + usage
4. `src/lib/app/bootstrap/create_app_stores.ts` — `SttStore` import + usage
5. `src/lib/shared/types/editor_settings.ts` — `SttInsertMode` type, "speech" category, STT settings fields + defaults
6. `src/lib/features/editor/ui/editor_status_bar.svelte` — `SttStatusIndicator` import + usage
7. `src/lib/features/settings/ui/settings_dialog.svelte` — STT imports, props, "speech" tab, STT settings rendering
8. `src/lib/features/hotkey/domain/default_hotkeys.ts` — STT hotkey bindings
9. `src/lib/reactors/index.ts` — STT reactor imports + mounting
10. `src/lib/app/bootstrap/ui/workspace_layout.svelte` — STT props passed to status bar

**Rust side:** 11. `src-tauri/src/features/mod.rs` — `#[cfg(feature = "stt")] pub mod stt;` line 12. `src-tauri/src/main.rs` — `--stt-list-devices` CLI flag 13. `src-tauri/src/app/mod.rs` — STT state init + command registration

## Step 5: Run checks

- `pnpm check`, `pnpm lint`, `pnpm test`
- `cd src-tauri && cargo check`
- Fix any compilation errors from dangling references

## Step 6: Commit

Single commit: "chore: remove STT subsystem, archived on archive/stt-main"
