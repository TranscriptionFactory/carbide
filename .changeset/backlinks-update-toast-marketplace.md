---
"carbide": minor
---

### Backlinks

- Backlinks now work natively via search DB; merge with LSP when available
- Resolve outlinks on individual note upserts (not only during full sync)
- Fall back to search DB results when LSP is not running or errors

### Update flow

- Manual update check shows a confirmation toast with Update/Later buttons instead of auto-installing

### Plugin marketplace

- Add plugin marketplace: fetches listings from a configurable GitHub repo, displays in a Browse tab, and installs plugins to ~/.carbide/plugins/
- Includes Rust backend commands, TS port/adapter/service/store, DI wiring, action registration, and Browse tab UI
