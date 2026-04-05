#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IWE_DIR="$REPO_ROOT/vendor/iwe"
SERDE_COMMIT="e578d23"

cd "$IWE_DIR"

# Discard unstaged changes (upstream diffs, no local work)
git checkout -- .

# Reset 'main' to upstream + serde fix
git checkout main
git reset --hard upstream/master
git cherry-pick "$SERDE_COMMIT"

echo "Created 'main' branch at $(git rev-parse --short HEAD)"

# Update submodule pointer in carbide
cd "$REPO_ROOT"
git add vendor/iwe
git config -f .gitmodules submodule.vendor/iwe.branch main
git add .gitmodules
git commit -m "Update vendor/iwe to upstream + serde(default) fix"

echo "Done. Carbide now points to vendor/iwe@main"
