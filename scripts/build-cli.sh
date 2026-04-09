#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="$REPO_ROOT/src-tauri/binaries"

TARGET="${TAURI_ENV_TARGET_TRIPLE:-$(rustc -vV | sed -n 's/host: //p')}"

mkdir -p "$BIN_DIR"

echo "Building carbide-cli for $TARGET..."
cargo build --release --manifest-path "$REPO_ROOT/src-tauri/Cargo.toml" -p carbide-cli --target "$TARGET"

SRC="$REPO_ROOT/src-tauri/target/$TARGET/release/carbide-cli"
if [ "$(uname -o 2>/dev/null || echo '')" = "Msys" ] || [ "${OS:-}" = "Windows_NT" ]; then
  SRC="$REPO_ROOT/src-tauri/target/$TARGET/release/carbide-cli.exe"
  DEST="$BIN_DIR/carbide-cli-$TARGET.exe"
else
  DEST="$BIN_DIR/carbide-cli-$TARGET"
fi

cp "$SRC" "$DEST"
chmod +x "$DEST"
echo "Installed carbide-cli to $DEST"
