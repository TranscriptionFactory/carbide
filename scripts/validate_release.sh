#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

GREEN='\033[0;32m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

step() {
  local label="$1"
  local cmd="$2"
  echo -e "\n${BOLD}→ ${label}...${NC}"
  if eval "$cmd"; then
    pass "$label"
  else
    fail "$label"
  fi
}

echo -e "${BOLD}Carbide Release Validation${NC}"
echo "================================"

step "Rust type check" "cd src-tauri && cargo check 2>&1"
step "TypeScript type check" "pnpm check 2>&1"
step "Lint" "pnpm lint 2>&1"
step "Vitest unit tests" "pnpm test 2>&1"
step "Rust tests" "cd src-tauri && cargo test 2>&1"

echo -e "\n${BOLD}→ Version coherence...${NC}"
PKG_VERSION=$(node -p "require('./package.json').version")
TAURI_VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
CARGO_VERSION=$(grep '^version' src-tauri/Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')

if [[ "$PKG_VERSION" == "$TAURI_VERSION" && "$TAURI_VERSION" == "$CARGO_VERSION" ]]; then
  pass "Version coherence ($PKG_VERSION)"
else
  fail "Version mismatch: package.json=$PKG_VERSION tauri.conf.json=$TAURI_VERSION Cargo.toml=$CARGO_VERSION"
fi

echo -e "\n${GREEN}${BOLD}All checks passed.${NC}"
