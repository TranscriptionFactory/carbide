# Release Publishing Setup

## 1. GitHub Secrets (Required)

Go to **Settings → Secrets and variables → Actions** and add:

| Secret                               | Description                               |
| ------------------------------------ | ----------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Private key for signing updater artifacts |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the private key              |

**Generate signing key:**

```bash
pnpm tauri signer generate -w ~/.tauri/badgerly.key
```

This outputs:

- Private key (save as `TAURI_SIGNING_PRIVATE_KEY`)
- Password (save as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)
- Public key (already in your `tauri.conf.json`)

## 2. Add Changeset Version Workflow

You need a workflow to consume changesets, bump version, and create the tag. Create `.github/workflows/changeset-version.yml`:

```yaml
name: Changeset Version

on:
  push:
    branches: [main]

jobs:
  version:
    if: github.event.commits[0].author.name != 'github-actions[bot]'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install

      - name: Create Release Pull Request or Version
        id: changesets
        uses: changesets/action@v1
        with:
          version: pnpm version
          commit: "chore: release ${{ github.ref_name }}"
          title: "chore: release"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 3. Update package.json version script

Your current `version` script syncs versions but doesn't create tags. Add a postversion hook:

```json
{
  "scripts": {
    "version": "node scripts/sync-versions.mjs && pnpm install",
    "postversion": "git push --follow-tags"
  }
}
```

## 4. Release Flow

```
1. Add changesets → .changeset/*.md files
2. Merge to main → changeset-version workflow creates PR
3. Merge version PR → creates git tag (v2.1.0)
4. Tag push → release.yml builds app, creates GitHub release
```

## 5. macOS Code Signing (Optional but Recommended)

For notarized builds, add these secrets:

| Secret                       | Description                     |
| ---------------------------- | ------------------------------- |
| `APPLE_CERTIFICATE`          | Base64-encoded .p12 certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for .p12               |
| `APPLE_SIGNING_IDENTITY`     | Certificate identity name       |
| `APPLE_ID`                   | Apple Developer email           |
| `APPLE_PASSWORD`             | App-specific password           |
| `APPLE_TEAM_ID`              | Team ID                         |

Then update `tauri.conf.json`:

```json
"macOS": {
  "signingIdentity": "${APPLE_SIGNING_IDENTITY}"
}
```

And add to release.yml env:

```yaml
APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
APPLE_ID: ${{ secrets.APPLE_ID }}
APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

## Quick Reference: Cutting a Release

```bash
# 1. Create a changeset (interactive — pick patch/minor/major, describe changes)
pnpm changeset

# 2. Commit the changeset file
git add .changeset/ && git commit -m "chore: add changeset for <description>"

# 3. Push to main (or merge a PR)
git push origin main

# 4. The changeset-version workflow creates a "Version Packages" PR
#    — merging that PR bumps versions and creates a vX.Y.Z tag
#    — the tag push triggers release.yml which builds all platforms

# --- Manual release (bypass changesets) ---

# Bump versions everywhere
VERSION=1.3.0
node scripts/sync-versions.mjs  # syncs package.json → tauri.conf.json + Cargo.toml
git add -A && git commit -m "chore: bump to v${VERSION}"

# Create and push tag
git tag "v${VERSION}"
git push origin main "v${VERSION}"

# --- Re-run a failed release build ---
# Go to: https://github.com/TranscriptionFactory/carbide/actions
# Find the failed run → click "Re-run failed jobs"
```

---

**Quick start:** Just set the two `TAURI_SIGNING_*` secrets and you're ready for unsigned releases. Add code signing later for production.

1. Merge this branch to main — you're on feat/reskinning_prototypes with 5 commits ahead
2. Push to main — triggers the changeset-version workflow, which creates a "Version
   Packages" PR
3. Merge that PR — bumps versions, creates a vX.Y.Z tag
4. Tag push triggers release.yml — builds the app for all platforms and creates a GitHub
   release
