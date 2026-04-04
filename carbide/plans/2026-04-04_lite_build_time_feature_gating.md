# Carbide Lite: Build-Time Feature Gating Plan

**Date:** 2026-04-04
**Status:** In Progress
**Branch:** carbide-lite → merge to main

## Problem

carbide-lite lives on a diverging branch (30 commits ahead, 6 behind main). The runtime `app_target` check works but:
- Rust binary ships everything (candle ML, PDF extraction, plugin host) even for lite
- No TS tree-shaking — full-only code is bundled but dead
- Branch maintenance is unsustainable as main evolves

## Solution: Two-Layer Build Gating

```
┌─────────────────────────────────────────────────┐
│  Cargo.toml [features]                          │
│  ┌─────────┐  ┌──────────────────────────────┐  │
│  │  lite    │  │  full = lite + ai + semantic │  │
│  │ (default)│  │  + plugins + refs + canvas   │  │
│  └─────────┘  └──────────────────────────────┘  │
├─────────────────────────────────────────────────┤
│  Vite define: __CARBIDE_LITE__ = true | false   │
│  → tree-shakes TS stores, actions, UI shells    │
├─────────────────────────────────────────────────┤
│  tauri.lite.conf.json (already exists)          │
│  → product name, window URL, capabilities       │
└─────────────────────────────────────────────────┘
```

## Rust Feature Flags

### Cargo.toml Features Section

```toml
[features]
default = ["full"]
lite = []
full = [
  "lite",
  "feat-ai",
  "feat-semantic-search",
  "feat-plugins",
  "feat-references",
  "feat-canvas",
  "feat-tasks",
  "feat-bases",
  "feat-toolchain",
]

feat-ai = []
feat-semantic-search = [
  "dep:candle-core", "dep:candle-nn", "dep:candle-transformers",
  "dep:hf_hub", "dep:tokenizers",
]
feat-plugins = []
feat-references = ["dep:pdf-extract", "dep:lopdf"]
feat-canvas = []
feat-tasks = []
feat-bases = []
feat-toolchain = ["dep:flate2", "dep:tar"]
```

### Module-to-Feature Mapping

| Module | Feature | Key Dependencies |
|---|---|---|
| vault, notes, watcher, settings, git, search (core), lint, markdown_lsp, code_lsp | Always (lite) | rusqlite, git2, comrak |
| ai, pipeline | feat-ai | std::process |
| search/embeddings, search/vector_db, search/hybrid | feat-semantic-search | candle-*, hf_hub, tokenizers |
| plugin | feat-plugins | serde_yml |
| reference | feat-references | pdf-extract, lopdf, reqwest |
| canvas | feat-canvas | serde_json |
| tasks | feat-tasks | search::db |
| bases | feat-bases | search::db |
| toolchain | feat-toolchain | flate2, tar, reqwest |

### Command Registration Strategy

The `generate_handler![]` macro in `app/mod.rs` takes a flat list of 126 commands. Strategy:

1. Use `#[cfg(feature = "feat-X")]` on each full-only command function
2. In the handler list, wrap full-only commands in cfg blocks
3. Corresponding state `.manage()` calls also get cfg gates

### Expected Binary Size Reduction (lite)

- candle-* ML stack: ~50-100 MB
- pdf-extract + lopdf: ~20 MB
- tokenizers (onig): ~10 MB
- Total: ~70-150 MB reduction (uncompressed)

## Vite Build-Time Flags

### vite.config.ts

```typescript
const variant = process.env.CARBIDE_VARIANT ?? "full";
define: { __CARBIDE_LITE__: JSON.stringify(variant === "lite") }
```

### TS Refactoring Pattern

```typescript
// Before (runtime)
const is_lite = app_target === "lite";
const ai = is_lite ? undefined : new AiStore();

// After (compile-time, tree-shakeable)
const ai = __CARBIDE_LITE__ ? undefined : new AiStore();
```

### Files to Refactor

- `create_app_stores.ts` — conditional store creation
- `create_app_context.ts` — 13 `is_lite` checks → `__CARBIDE_LITE__`
- `app_surface.ts` — surface config selection
- `+page.svelte` — remove URL param parsing
- `search_commands.ts` — command registry gating

## Build Scripts

```json
{
  "dev": "tauri dev",
  "dev:lite": "CARBIDE_VARIANT=lite tauri dev --config src-tauri/tauri.lite.conf.json --features lite",
  "build": "tauri build",
  "build:lite": "CARBIDE_VARIANT=lite tauri build --config src-tauri/tauri.lite.conf.json --features lite"
}
```

## Implementation Steps

| Step | What | Risk | Status |
|---|---|---|---|
| 1 | Add `[features]` to Cargo.toml, make heavy deps optional | Low | TODO |
| 2 | Gate Rust modules with `#[cfg(feature)]` | Medium | TODO |
| 3 | Gate command registration and state in `app/mod.rs` | Medium | TODO |
| 4 | Spike: verify `generate_handler!` works with cfg-gated fns | High | TODO |
| 5 | Add `__CARBIDE_LITE__` Vite define | Low | TODO |
| 6 | Replace runtime `app_target` checks with compile-time | Medium | TODO |
| 7 | Update build scripts | Low | TODO |
| 8 | Validate: `cargo check --features lite` compiles | — | TODO |
| 9 | Validate: `pnpm dev:lite` boots correctly | — | TODO |
| 10 | Merge to main, delete branch | Medium | TODO |
