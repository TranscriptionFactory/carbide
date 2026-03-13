# OctoBase Portability Assessment for Carbide

## 1. Executive Summary

OctoBase is a local-first, offline-available collaborative database written in Rust, built for AFFiNE. It provides CRDT-based conflict-free synchronization, a block-based data model (Workspace → Space → Block), and storage abstractions over SQLite/Postgres/MySQL.

**Verdict: Anti-donor for Carbide's current roadmap.** The fundamental source-of-truth model is incompatible with Carbide's Markdown-native architecture. OctoBase treats its CRDT store as authoritative; Carbide treats Markdown files on disk as authoritative. Porting any core component would either violate Carbide's non-negotiables or over-engineer what is already a clean, working implementation.

OctoBase remains a valid **design reference** for future cross-device sync work, if that ever enters scope.

## 2. What OctoBase Is

- **CRDT-driven database** for offline-first collaborative apps
- **Block-based data model**: atomic blocks with flavour, children, and arbitrary properties, organized into Spaces and Workspaces
- **Storage-agnostic**: SQLite, Postgres, MySQL via sea-orm; S3-compatible blob storage via OpenDAL
- **Sync layer**: WebSocket and WebRTC connectors with awareness protocol
- **Multi-platform bindings**: Rust core with JNI (Android), Swift (iOS), WASM (Web) bindings
- **Built for AFFiNE**: designed around AFFiNE's block editor, not Markdown vaults
- **Status**: Pre-1.0, under active development. Full-text indexing still in progress

## 3. Architecture Comparison

| Aspect | OctoBase | Carbide |
|---|---|---|
| **Source of truth** | CRDT block store | Markdown files on disk |
| **Data model** | Block → Space → Workspace (schemaless CRDT atoms) | Vault → Note → Frontmatter + body |
| **Storage** | sea-orm abstraction (SQLite/Postgres/MySQL) | Derived SQLite index over filesystem |
| **Mutation path** | Mutate CRDT doc → serialize to storage | Edit Markdown file → re-index derived cache |
| **Collaboration** | Real-time multi-user via CRDT merge | Single-user, local-first |
| **Query** | Block traversal by flavour/children | SQL over derived metadata (FTS5, properties, tags) |
| **Sync** | WebSocket/WebRTC with state vectors | Not in scope |
| **Dependencies** | Heavy (sea-orm, y-octo, tokio, OpenDAL) | Lean (rusqlite, git2, tauri-plugin-pty) |

## 4. Donor Classification

### Anti-donors (Do not port)

| Component | Reason |
|---|---|
| **CRDT codec (jwst-codec)** | Solves multi-user conflict resolution. Carbide is single-user. Adds complexity for zero benefit |
| **Block data model (jwst-core)** | Incompatible with Markdown-as-truth. Would require abandoning Obsidian-flavored Markdown storage |
| **Storage layer (jwst-storage)** | sea-orm abstraction is over-engineered for Carbide's derived SQLite index. Carbide's ~200-line schema is cleaner for its use case |
| **RPC/sync layer (jwst-rpc)** | No collaboration target exists. Would be dead code |
| **Workspace model** | OctoBase workspaces are CRDT documents. Carbide vaults are filesystem directories. Fundamentally different ownership models |
| **Full-text indexing** | Still in-progress in OctoBase. Carbide already has working FTS5 over Markdown content |

### Design references only (Study, do not port)

| Component | When relevant | What to borrow |
|---|---|---|
| **Sync connector abstraction** | If cross-device vault sync enters scope (Phase 5+) | Pluggable transport pattern (WebSocket/WebRTC), awareness protocol for client presence |
| **Blob storage trait** | If Carbide needs managed attachment/asset storage beyond raw filesystem | Clean trait design: check/get/put/delete with metadata, content-type tracking |
| **Binary codec patterns** | If Carbide needs compact wire format for vault snapshots or export | Varint encoding, efficient binary serialization techniques |
| **Connection pooling** | Already addressed | Carbide's existing SQLite WAL + connection pool pattern is sufficient |

## 5. Impact on Current Roadmap

### No revisions needed

The current roadmap (`carbide/implementation/unified_ferrite_lokus_roadmap.md`) correctly identifies the right donors:

- **Lokus** → UX patterns, settings breadth, query semantics, graph data flow (safe donors)
- **Ferrite** → Buffer management, write safety, encoding detection (performance donors)

OctoBase does not appear in the roadmap, and this is correct. The existing Phases 2–4 implementation on `feat/graph-mvp` is well-advanced:

| Feature | Status | Architecture |
|---|---|---|
| Graph MVP | Complete | Read surface over search DB (notes + outlinks) |
| Metadata index | Complete | Derived SQLite tables from YAML frontmatter |
| Bases query engine | Complete | SQL filters, sorting, pagination over note_properties |
| Task extraction | Initial impl | Markdown checkbox parsing with safe round-trip mutations |

All of these are built on the correct Markdown-native, derived-index architecture. Porting OctoBase components would require either:

1. **Abandoning Markdown-as-truth** — violates non-negotiables
2. **Using OctoBase as a heavy replacement** for what is currently a clean, working SQLite schema — over-engineering

Neither is justified.

## 6. Key OctoBase Files for Future Reference

If cross-device sync ever enters scope, study these:

| File | Purpose |
|---|---|
| `libs/jwst-rpc/src/connector/` | Pluggable transport connectors (WebSocket, WebRTC, memory) |
| `libs/jwst-rpc/src/handler.rs` | Sync message handling and state reconciliation |
| `libs/jwst-storage/src/storage/mod.rs` | Storage trait definitions (DocStorage, BlobStorage) |
| `libs/jwst-codec/src/doc/codec/` | Binary serialization format |
| `apps/keck/src/` | Sync server implementation |

## 7. Bottom Line

OctoBase solves a different problem (collaborative CRDT database) for a different product shape (block-based editor). Carbide should continue treating Markdown files as the source of truth, SQLite as a derived index, and the existing Otterly architecture as the implementation base. OctoBase joins the reference shelf alongside Lokus and Ferrite — to be studied selectively, not ported.
