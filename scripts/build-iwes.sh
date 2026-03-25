#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IWE_DIR="$REPO_ROOT/vendor/iwe"
BIN_DIR="$REPO_ROOT/src-tauri/binaries"

TARGET="${TAURI_ENV_TARGET_TRIPLE:-$(rustc -vV | sed -n 's/host: //p')}"

mkdir -p "$BIN_DIR"

echo "Building iwes for $TARGET..."
cargo build --release --manifest-path "$IWE_DIR/Cargo.toml" -p iwes --target "$TARGET"

SRC="$IWE_DIR/target/$TARGET/release/iwes"
if [ "$(uname -o 2>/dev/null || echo '')" = "Msys" ] || [ "${OS:-}" = "Windows_NT" ]; then
  SRC="$IWE_DIR/target/$TARGET/release/iwes.exe"
  DEST="$BIN_DIR/iwes-$TARGET.exe"
else
  DEST="$BIN_DIR/iwes-$TARGET"
fi

cp "$SRC" "$DEST"
chmod +x "$DEST"
echo "Installed iwes to $DEST"
