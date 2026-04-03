# git-crypt Corruption Post-Mortem (2026-03-20)

## What happened

Commit `4985b54f` ("updating plans") corrupted 104 of 106 encrypted files in `carbide/`.

Every corrupted blob grew by exactly 22 bytes compared to its previous version, suggesting the files were re-encrypted with an invalid or mismatched encryption state. The git-crypt HMAC check fails on these blobs ("encrypted file has been tampered with"), making them permanently unrecoverable.

One file (`carbide/2026-03-20_vault_startup.md`) was committed **unencrypted** in an earlier commit (`cb67cc78`), bypassing the git-crypt clean filter entirely. This was a separate issue from the bulk corruption.

### Root cause

The most likely cause: the files were staged or committed while git-crypt was in an inconsistent state — e.g., the symmetric key in `.git/git-crypt/keys/default` was temporarily missing, replaced, or the clean filter was misconfigured. When the clean filter re-encrypts with a different key or nonce state than what produced the original ciphertext, git-crypt's HMAC validation rejects the blob on decryption.

The `SETUP.md` file (`carbide/.git-crypt/SETUP.md`) was separately corrupted — its blob doubled in size (3691 -> 6588 bytes) — and was fixed in commit `0b37c5b5` before the broader corruption was addressed.

### Symptoms

- `git-crypt unlock` failed with "encrypted file has been tampered with"
- All `carbide/` files showed as modified (+22 bytes each) even after `git checkout`
- Files on disk contained `\0GITCRYPT\0` headers (encrypted) but could not be decrypted
- Chicken-and-egg: dirty working tree blocked `git-crypt unlock`, and the dirty state was caused by git-crypt's own filters

## How it was fixed

### 1. Identified the corruption boundary

```bash
# Found that cb67cc78 (parent of 4985b54f) had clean blobs
git ls-tree -r cb67cc78 -- carbide/ | while read mode type hash filepath; do
  err=$(git-crypt smudge < <(git cat-file blob "$hash") 2>&1 1>/dev/null)
  [ -n "$err" ] && echo "BAD: $filepath"
done
```

Only `carbide/2026-03-20_vault_startup.md` was bad at `cb67cc78` (committed unencrypted). All other files were clean.

### 2. Broke the chicken-and-egg lock

```bash
# Temporarily disabled the clean filter so files stop appearing modified
git config filter.git-crypt.clean cat
git checkout -- carbide/

# Unlocked with symmetric key (GPG pinentry wasn't available)
git-crypt unlock /Users/abir/.config/git-crypt/badgerly.key

# This partially succeeded — smudge filter set, but checkout failed on tampered blobs
```

### 3. Restored files from last good commit

```bash
# Restored 95 corrupted files from cb67cc78
git checkout cb67cc78 -- <each corrupted file>

# Recovered vault_startup.md from origin/main (existed there unencrypted)
git checkout origin/main -- carbide/2026-03-20_vault_startup.md
```

### 4. Verified and committed

```bash
# Verified zero corrupted blobs remain
git ls-tree -r HEAD --name-only -- carbide/ | while read filepath; do
  hash=$(git ls-tree HEAD -- "$filepath" | awk '{print $3}')
  err=$(git-crypt smudge < <(git cat-file blob "$hash") 2>&1 1>/dev/null)
  [ -n "$err" ] && echo "STILL BAD: $filepath"
done
# Output: (none)
```

## Data loss

Changes made in commit `4985b54f` ("updating plans") are unrecoverable — the corrupted blobs cannot be decrypted. Given that every file was modified with a uniform +22 byte delta, this was almost certainly a bulk re-encryption artifact, not 104 files with meaningful content edits. Files were restored to their state at `cb67cc78` (the commit immediately before).

## Prevention

- **Export and back up the symmetric key.** Store at a known path (e.g., `~/.config/git-crypt/badgerly.key`) so you can unlock without GPG.
- **Never commit carbide/ files when git-crypt is in a locked or inconsistent state.** Run `git-crypt status` to verify before committing.
- **Lock/unlock explicitly.** Use `git-crypt lock` before switching branches or doing operations that might interfere with filters. Use `git-crypt unlock <keyfile>` to resume work.
- **Check for the `\0GITCRYPT\0` header** on disk files — if you see it when you expect plaintext, the repo is locked or broken.
