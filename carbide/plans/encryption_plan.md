# Note Encryption Implementation Plan

## Overview

This document outlines the implementation plan for adding end-to-end encryption to Badgerly/Carbide notes using the age encryption format.

## Current State

- **Notes**: Plain markdown files in user-specified vault directories
- **Search index**: Unencrypted SQLite in `~/.badgerly/caches/`
- **No encryption infrastructure exists**

## Design Decisions

### Encryption Scope: Hybrid

- **Encrypted**: Note content (markdown body)
- **Plaintext**: Filenames, folder structure, file metadata (size, mtime)

Rationale: Preserves git workflow, allows file organization to remain visible while protecting sensitive content.

### Search: Decrypt On-the-Fly

- Decrypt content when reading for indexing
- Search index stores derived data (tokens, embeddings) in user-local cache
- No encrypted search index (complexity not justified for this use case)

### Key Management: OS Keychain + Password

- Primary: Store age identity in OS keychain (keyring-rs)
- Backup: Password-derived key via Argon2id
- Supports both auto-unlock (keychain) and manual unlock (password)

### Format: Pure Age (Not SOPS)

- SOPS is designed for structured config files (YAML/JSON with encrypted fields)
- For markdown, encrypting the whole file is cleaner
- Age format is git-friendly and widely supported
- Extension: `.age.md` for encrypted notes

## Architecture

### File Format

```
# Plaintext note: note.md
# Encrypted note: note.age.md (age armored format)

-----BEGIN AGE ENCRYPTED FILE-----
YWdlLWVuY3J5cHRpb24ub3JnL3YxCi0+IFgyNTUxOS...
-----END AGE ENCRYPTED FILE-----
```

### Key Files

| File                                      | Purpose                 |
| ----------------------------------------- | ----------------------- |
| `~/.badgerly/keys/{vault_id}.age`         | Encrypted age identity  |
| OS keychain service `badgerly-{vault_id}` | Auto-unlock key storage |

### Rust: Encryption Feature Module

```
src-tauri/src/features/encryption/
├── mod.rs              # Public API
├── service.rs          # Encryption state + commands
├── age_wrapper.rs      # age crate integration
├── keychain.rs         # OS keychain storage (keyring-rs)
└── key_derivation.rs   # Argon2id for password → key
```

### Dependencies

Add to `src-tauri/Cargo.toml`:

```toml
age = "0.10"
keyring = "3"           # OS keychain integration
argon2 = "0.5"          # Password-based key derivation
```

### Frontend: Encryption Feature Module

```
src/lib/features/encryption/
├── index.ts
├── ports.ts                    # EncryptionPort interface
├── state/encryption_store.svelte.ts
├── application/encryption_service.ts
├── application/encryption_actions.ts
├── adapters/encryption_tauri_adapter.ts
└── ui/
    ├── unlock_vault_dialog.svelte
    └── encryption_settings.svelte
```

## Data Flow

### Vault Unlock Flow

```
1. Check OS keychain for stored age identity
   ├─ Found → Decrypt with keychain key
   └─ Not found → Prompt for password

2. Password path:
   ├─ Derive key via Argon2id
   ├─ Decrypt age identity file
   └─ Cache in memory (locked to app session)

3. Store decrypted identity in:
   ├─ Memory (BufferManager holds plaintext)
   └─ OS keychain (optional, for auto-unlock)
```

### Read Path

```
notes/service.rs:read_note()
├─ Check if .age.md extension
├─ If encrypted:
│   ├─ Call encryption::decrypt_note()
│   ├─ Return plaintext to BufferManager
│   └─ Index plaintext for search
└─ Else: read plaintext directly
```

### Write Path

```
notes/service.rs:write_note()
├─ Check vault encryption setting
├─ If enabled:
│   ├─ Call encryption::encrypt_note()
│   ├─ Write .age.md file
│   └─ Update search index from plaintext
└─ Else: write plaintext .md
```

### Search Integration

Current: Index on file read, store in SQLite
With encryption: Same flow, but decrypt before indexing

```rust
// search/db.rs - no changes needed
// content is already decrypted by notes/service.rs
fn index_note(&self, path: &str, content: &str) {
    // existing implementation unchanged
}
```

The search index stores plaintext-derived data (tokens, embeddings) in `~/.badgerly/caches/` which is user-local and not synced.

## Migration Flow

For existing vaults enabling encryption:

```
1. User enables encryption in vault settings
2. Prompt: "This will encrypt all notes. Continue?"
3. Generate age identity (or import existing)
4. Set password for key derivation
5. Background migration:
   for each .md file:
     a. Read plaintext
     b. Encrypt with age
     c. Write .age.md
     d. Delete .md (after verify)
     e. Git add (if git enabled)
6. Update vault metadata: encrypted=true
```

## Git Integration

### Benefits of Age Format

- Works with git out of the box
- Binary-safe, no merge conflicts on encrypted content
- Can use `.gitattributes` for diff helpers

### Optional Diff Helper

Add to vault `.gitattributes`:

```
*.age.md diff=age
```

Users can install `rage-diff` for readable diffs when unlocked.

### SOPS Alternative

If users want SOPS integration for external tooling:

- Add `.sops.yaml` to vault root
- Use `sops` CLI for external operations
- App still uses age internally (SOPS supports age backend)

## UI Components

### New UI Elements

| Component           | Purpose                       |
| ------------------- | ----------------------------- |
| Unlock vault dialog | Password prompt on vault open |
| Encryption settings | Toggle in vault settings      |
| Lock vault action   | Cmd+Shift+L, clear memory     |
| Status indicator    | Locked/unlocked state in UI   |

### Vault Settings Addition

```typescript
interface VaultSettings {
  // existing settings...
  encryption: {
    enabled: boolean;
    has_keychain_key: boolean;
  };
}
```

## Implementation Phases

| Phase                    | Scope                                                   | Effort   |
| ------------------------ | ------------------------------------------------------- | -------- |
| **1. Core encryption**   | age wrapper, keychain storage, encrypt/decrypt commands | 3-4 days |
| **2. Notes integration** | Modify notes/service.rs, file format handling           | 2-3 days |
| **3. Frontend**          | Unlock dialog, settings UI, lock/unlock actions         | 2-3 days |
| **4. Migration**         | Background encryption of existing vaults                | 1-2 days |
| **5. Polish**            | Error handling, edge cases, tests                       | 2-3 days |

**Total: ~10-15 days**

## Security Considerations

### What This Protects

- Note content at rest (files on disk)
- Note content in git history
- Note content if device is stolen (with keychain)

### What This Does NOT Protect

- Metadata (filenames, folder structure, file sizes)
- Content in memory while app is running
- Content if device is compromised while unlocked
- Search index (stored unencrypted in user-local cache)

### Threat Model

| Threat                    | Mitigation                         |
| ------------------------- | ---------------------------------- |
| Device theft              | Encrypted files + keychain lock    |
| Git repo exposure         | Encrypted content in history       |
| Memory dump while running | Not in scope (OS-level protection) |
| Malware on device         | Not in scope (OS-level protection) |

## Open Questions

1. **Per-note encryption toggle?** Currently designed as vault-level. Could add per-note override if needed.

2. **Key rotation?** Age supports multiple recipients. Could add key rotation flow for added security.

3. **Multi-device sync?** Age identity can be exported/imported. Could add key export UI for multi-device setup.

4. **Biometric unlock?** OS keychain supports biometrics on macOS/Windows. Could leverage for unlock flow.

## References

- [age encryption format](https://github.com/FiloSottile/age)
- [rage (Rust implementation)](https://github.com/str4d/rage)
- [SOPS](https://github.com/getsops/sops)
- [keyring-rs](https://crates.io/crates/keyring)
