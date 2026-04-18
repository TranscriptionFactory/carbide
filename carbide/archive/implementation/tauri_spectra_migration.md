# Plan: Migrate to tauri-specta for Type-Safe IPC

> Status: **In Progress — Phase 4 (CI Integration)**
> Estimated effort: 2-3 days
> Branch: `feat/tauri-specta-migration`

---

## Problem

The codebase has **99 Tauri commands** with manually maintained TypeScript type mappings. Each adapter file contains:

1. `TauriXxx` type aliases duplicating Rust structs
2. Manual mapping functions (`to_note_meta()`, `map_note_links_snapshot()`)
3. Risk of type drift between Rust and TypeScript

**Current pattern (search_tauri_adapter.ts):**

```typescript
type TauriNoteMeta = {
  id: string;
  path: string;
  title: string;
  name: string;
  mtime_ms: number;
  size_bytes: number;
};

function to_note_meta(hit: TauriNoteMeta) {
  return {
    id: hit.id as NoteId,
    path: hit.path as NoteId,
    // ...manual mapping
  };
}
```

**Rust side (search/service.rs):**

```rust
#[derive(Debug, Clone, Serialize)]
pub struct NoteMeta {
    pub id: String,
    pub path: String,
    pub title: String,
    pub name: String,
    pub mtime_ms: i64,
    pub size_bytes: i64,
}
```

Any change to Rust structs requires manual TypeScript updates. This has caused subtle bugs where field names diverged.

## Solution

**tauri-specta** auto-generates TypeScript bindings from Rust types:

1. Annotate commands with `#[specta::specta]`
2. Derive `specta::Type` on all serializable structs
3. Run export to generate `bindings.ts`
4. Adapters import generated types directly

**Result:**

```typescript
// Generated bindings.ts
export type NoteMeta = {
  id: string;
  path: string;
  title: string;
  name: string;
  mtime_ms: number;
  size_bytes: number;
};

// Adapter uses generated type directly
import type { NoteMeta } from "$lib/generated/bindings";
```

## Benefits

| Aspect       | Before                        | After                   |
| ------------ | ----------------------------- | ----------------------- |
| Type sync    | Manual, error-prone           | Auto-generated          |
| Boilerplate  | ~20 mapping functions         | 0                       |
| IDE support  | Partial (generic `invoke<T>`) | Full (actual types)     |
| Refactoring  | Update 2 places               | Update Rust, regenerate |
| New commands | Write types + mapping         | Add annotation          |

## Tradeoffs

| Concern             | Mitigation                                        |
| ------------------- | ------------------------------------------------- |
| Beta status (v2 RC) | 379k downloads, active maintenance, lock versions |
| Build step          | Add to `tauri dev` / `tauri build` scripts        |
| Migration effort    | Phased approach, one feature at a time            |
| Runtime overhead    | None (compile-time only)                          |

---

## Implementation

### Phase 0: Setup (1-2 hours)

**Add dependencies to `src-tauri/Cargo.toml`:**

```toml
[dependencies]
specta = { version = "=2.0.0-rc.20", features = ["typescript"] }
tauri-specta = { version = "=2.0.0-rc.21", features = ["typescript", "javascript"] }
```

**Create export script `src-tauri/src/bin/specta-export.rs`:**

```rust
use badgerly_lib::*;
use specta::collect_types;
use tauri_specta::ts;

fn main() {
    ts::export(
        collect_types![
            // All commands will be listed here
        ],
        "../src/lib/generated/bindings.ts"
    ).unwrap();
}
```

**Add npm script to `package.json`:**

```json
{
  "scripts": {
    "codegen": "cd src-tauri && cargo run --bin specta-export"
  }
}
```

**Create output directory:**

```
src/lib/generated/
  .gitignore    # Ignore bindings.ts
  bindings.ts   # Generated
```

### Phase 1: Pilot Feature — Notes (3-4 hours)

Migrate `notes` feature first (16 commands, most commonly used).

**1.1 Annotate Rust types:**

```rust
// src-tauri/src/features/notes/service.rs
use specta::Type;

#[derive(Debug, Clone, Serialize, Type)]  // Add Type derive
pub struct NoteMeta {
    pub id: String,
    pub path: String,
    pub name: String,
    pub title: String,
    pub mtime_ms: i64,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Type)]
pub struct NoteDoc {
    pub meta: NoteMeta,
    pub markdown: String,
}
```

**1.2 Annotate commands:**

```rust
#[tauri::command]
#[specta::specta]  // Add this
pub async fn list_notes(vault_id: String) -> Result<Vec<NoteMeta>, String> {
    // ...
}

#[tauri::command]
#[specta::specta]
pub async fn read_note(vault_id: String, note_id: String) -> Result<NoteDoc, String> {
    // ...
}
```

**1.3 Update export script:**

```rust
use badgerly_lib::features::notes::service::*;

ts::export(
    collect_types![
        list_notes,
        read_note,
        write_note,
        create_note,
        // ... all 16 notes commands
    ],
    "../src/lib/generated/bindings.ts"
).unwrap();
```

**1.4 Update TypeScript adapter:**

```typescript
// src/lib/features/note/adapters/notes_tauri_adapter.ts
import { invoke } from "@tauri-apps/api/core";
import type { NoteMeta, NoteDoc } from "$lib/generated/bindings";

export function create_notes_tauri_adapter(): NotesPort {
  return {
    async list_notes(vault_id: VaultId) {
      // Direct use of generated type, no mapping needed
      return await invoke<NoteMeta[]>("list_notes", { vaultId: vault_id });
    },
    // ...
  };
}
```

**1.5 Remove manual types:**

Delete `TauriNoteMeta`, `TauriNoteDoc` aliases and `to_note_meta()` mapping functions.

**1.6 Verify:**

```bash
pnpm codegen
pnpm check
cd src-tauri && cargo check
```

### Phase 2: Search Feature (4-5 hours)

Search has 26 commands and complex types (search hits, embeddings, etc.).

**Key types to migrate:**

- `SearchHit`, `SemanticSearchHit`, `HybridSearchHit`
- `NoteLinksSnapshot`, `LocalNoteLinksSnapshot`
- `EmbeddingStatus`, `IndexProgressEvent`

**Special handling:**

- `SearchScope` enum — ensure `#[derive(Type)]` with `serde` tag
- `IndexProgressEvent` — already has `#[serde(tag = "status")]`, compatible

**Adapter changes:**

Remove all `TauriXxx` aliases and mapping functions in `search_tauri_adapter.ts`.

### Phase 3: Remaining Features (4-6 hours)

Migrate in order of complexity:

| Feature        | Commands | Complexity                 |
| -------------- | -------- | -------------------------- |
| git            | 15       | Medium (many result types) |
| vault          | 10       | Low                        |
| graph          | 5        | Low                        |
| settings       | 4        | Low                        |
| vault_settings | 4        | Low                        |
| bases          | 4        | Low                        |
| watcher        | 2        | Low                        |
| tags           | 2        | Low                        |
| ai             | 2        | Low                        |
| canvas         | 4        | Low                        |
| pipeline       | 1        | Low                        |
| tasks          | 4        | Low                        |
| buffer         | 5        | Low                        |
| app            | 1        | Low                        |

### Phase 4: CI Integration (1 hour)

**Add to `package.json`:**

```json
{
  "scripts": {
    "prebuild": "pnpm codegen",
    "predev": "pnpm codegen"
  }
}
```

**Update `.github/workflows/release.yml`:**

```yaml
- name: Generate bindings
  run: pnpm codegen

- name: Type check
  run: pnpm check
```

**Add pre-commit hook (optional):**

```bash
# .husky/pre-commit
pnpm codegen
git add src/lib/generated/bindings.ts
```

---

## Files Changed

### Rust (src-tauri/)

| File                           | Change                                                            |
| ------------------------------ | ----------------------------------------------------------------- |
| `Cargo.toml`                   | Add `specta`, `tauri-specta` deps                                 |
| `src/bin/specta-export.rs`     | **New** — export script                                           |
| `src/features/*/service.rs`    | Add `#[derive(Type)]` to structs, `#[specta::specta]` to commands |
| `src/features/search/model.rs` | Add `#[derive(Type)]` to model structs                            |
| `src/shared/buffer.rs`         | Add `#[derive(Type)]` to buffer types                             |

### TypeScript (src/)

| File                                             | Change                                          |
| ------------------------------------------------ | ----------------------------------------------- |
| `src/lib/generated/bindings.ts`                  | **New** — generated types (gitignored)          |
| `src/lib/generated/.gitignore`                   | **New**                                         |
| `src/lib/features/*/adapters/*_tauri_adapter.ts` | Remove `TauriXxx` aliases, import from bindings |
| `package.json`                                   | Add `codegen` script                            |

---

## Command Inventory

**99 total commands** across features:

```
search/service.rs:     26 commands
notes/service.rs:      16 commands
git/service.rs:        15 commands
vault/service.rs:      10 commands
graph/service.rs:       5 commands
buffer.rs:              5 commands
canvas/mod.rs:          4 commands
vault_settings:         4 commands
bases/service.rs:       4 commands
settings/service.rs:    2 commands
watcher/service.rs:     2 commands
tags/service.rs:       2 commands
ai/service.rs:         2 commands
tasks/mod.rs:          4 commands
pipeline/service.rs:   1 command
app/mod.rs:            1 command
```

---

## Verification Checklist

After each phase:

- [ ] `cargo check` passes
- [ ] `pnpm codegen` generates bindings without errors
- [ ] `pnpm check` passes (TypeScript compiles with generated types)
- [ ] `pnpm test` passes
- [ ] Manual smoke test: open vault, create/edit note, search

---

## Rollback Plan

If issues arise:

1. Revert Cargo.toml dependency additions
2. Restore `TauriXxx` type aliases from git history
3. Remove `#[specta::specta]` annotations
4. Delete `src/lib/generated/` directory

No data loss risk — this is purely a type generation change.

---

## Open Questions

1. **Naming convention:** Generated types use Rust names (`NoteMeta`). Current TS uses `NoteMeta` too. No conflict expected, but verify.

2. **Enum handling:** `SearchScope`, `IndexProgressEvent` use `#[serde(tag = "status")]`. Specta supports this but needs testing.

3. **Result types:** Commands return `Result<T, String>`. Specta handles this — generates `T | { error: string }` or similar. Verify generated shape matches adapter expectations.

4. **Optional fields:** Rust `Option<T>` → TypeScript `T | null`. Current code uses `| undefined` in some places. May need minor adapter updates.

---

## References

- [tauri-specta docs](https://specta.dev/docs/tauri-specta/v2)
- [specta crate](https://docs.rs/specta)
- [GitHub: specta-rs/tauri-specta](https://github.com/specta-rs/tauri-specta)

---

## Progress Log

### Completed

#### Phase 0: Setup ✅ (Commit: 9908478)

- Added dependencies to `src-tauri/Cargo.toml`:
  - `specta = { version = "=2.0.0-rc.22" }`
  - `specta-typescript = "0.0.9"`
  - `tauri-specta = { version = "=2.0.0-rc.21", features = ["derive", "typescript"] }`
- Created specta export test in `src-tauri/src/tests/mod.rs` (uses test instead of binary for macro context)
- Added `codegen` npm script: `cd src-tauri && cargo test specta_export::export_bindings -- --nocapture`
- Created `src/lib/generated/` with `.gitignore` for `bindings.ts`
- Made `features` module public in `lib.rs` for export access

**Key decision:** Used `BigIntExportBehavior::Number` for i64 types (file sizes, timestamps) — acceptable since values rarely exceed 2^53.

#### Phase 1: Notes Feature ✅ (Commit: 9908478)

- Annotated 16 notes commands with `#[specta::specta]`
- Added `specta::Type` derive to all notes types:
  - `NoteMeta`, `NoteDoc`, `FileMeta`, `FolderContents`, `FolderStats`
  - `NoteWriteArgs`, `NoteCreateArgs`, `NoteRenameArgs`, etc.
  - `MoveItem`, `MoveItemResult`, `MoveItemsArgs`
- Updated `notes_tauri_adapter.ts` to use generated `commands` object
- Generated bindings include type-safe `Result<T, E>` wrapper

#### Phase 2: Search Feature ✅ (Commit: d123c04)

- Annotated 26 search commands with `#[specta::specta]`
- Added `specta::Type` derive to search model types:
  - `SemanticSearchHit`, `HybridSearchHit`, `BatchSemanticEdge`
  - `EmbeddingStatus`, `IndexNoteMeta`, `SearchScope`, `SearchHit`
  - `NoteStats`, `BaseNoteRow`, `BaseQuery`, `BaseFilter`, `BaseSort`
- Added `specta::Type` to search service types:
  - `NoteLinksSnapshot`, `SearchQueryInput`
  - `IndexProgressEvent`, `EmbeddingProgressEvent` (tagged enums work correctly)
- Added `specta::Type` to search db types:
  - `SuggestionHit`, `PlannedSuggestionHit`, `OrphanLink`
- Added `specta::Type` to link_parser types:
  - `ExternalLink`, `LocalLinksSnapshot`, `RewriteResult`

#### Phase 3: Remaining Features ✅

- ✅ Git feature (15 commands) — all types and commands annotated
- ✅ Vault feature (10 commands) — all types (`Vault`, `VaultMode`, `VaultEntry`, `VaultStore`) and commands annotated
- ✅ Graph feature (5 commands) — all types in `types.rs` and commands annotated
- ✅ Bases feature (4 commands) — `BaseViewDefinition` type annotated
- ✅ Watcher feature (2 commands) — `VaultFsEvent` enum annotated
- ✅ Tags feature (2 commands) — `TagInfo` type annotated
- ✅ AI feature (2 commands) — `AiExecutionResult`, `AiArgsTemplate`, `AiProviderConfig` types annotated
- ✅ Canvas feature (4 commands) — no custom types needed
- ✅ Tasks feature (4 commands) — `Task`, `TaskStatus`, `TaskUpdate` types annotated
- ✅ Pipeline feature (1 command) — `PipelineResult` type annotated
- ✅ Buffer feature (5 commands) — no custom types needed
- ✅ App feature (1 command) — no custom types needed

**Excluded from specta:**

- Settings (2 commands) — uses `serde_json::Value` which cannot be statically typed
- Vault settings (4 commands) — uses `serde_json::Value` which cannot be statically typed

**Total commands in bindings: 92** (excludes 6 settings/vault_settings commands that use dynamic JSON)

### Not Started

#### Phase 4: CI Integration

- [ ] Add `prebuild`/`predev` scripts to package.json
- [ ] Update GitHub workflows
- [ ] Add pre-commit hook (optional)

---

## Resumption Instructions

Phase 3 is complete. To finish the migration:

1. `git checkout feat/tauri-specta-migration`
2. Implement Phase 4 (CI Integration)
3. Optionally update TypeScript adapters to use generated commands (can be done incrementally)

**Current bindings location:** `src/lib/generated/bindings.ts` (gitignored)
