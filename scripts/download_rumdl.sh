#!/usr/bin/env bash
set -euo pipefail

RUMDL_VERSION="0.1.54"
RUMDL_DIR="src-tauri/binaries"

TARGET="${1:-$(rustc --print host-tuple)}"
echo "Downloading rumdl v${RUMDL_VERSION} for ${TARGET}..."

mkdir -p "${RUMDL_DIR}"

BASE_URL="https://github.com/rvben/rumdl/releases/download/v${RUMDL_VERSION}"

if [[ "${TARGET}" == *"windows"* ]]; then
    ARCHIVE="rumdl-v${RUMDL_VERSION}-${TARGET}.zip"
    EXT=".exe"
else
    ARCHIVE="rumdl-v${RUMDL_VERSION}-${TARGET}.tar.gz"
    EXT=""
fi

DOWNLOAD_URL="${BASE_URL}/${ARCHIVE}"
DEST="${RUMDL_DIR}/rumdl-${TARGET}${EXT}"

if [[ -f "${DEST}" ]]; then
    echo "Binary already exists at ${DEST}"
    exit 0
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "${TMPDIR}"' EXIT

echo "Downloading ${DOWNLOAD_URL}..."
curl -sSL -o "${TMPDIR}/${ARCHIVE}" "${DOWNLOAD_URL}"

# SHA256 verification (pinned hashes for v0.1.54)
sha256() {
    if command -v shasum &>/dev/null; then
        shasum -a 256 "$1" | cut -d' ' -f1
    else
        sha256sum "$1" | cut -d' ' -f1
    fi
}

verify_hash() {
    local file="$1"
    local expected=""

    case "${TARGET}" in
        aarch64-apple-darwin)   expected="71516cf0caf33033945188e46c28da054c32830e58eb3e83709c742b56bb229d" ;;
        x86_64-apple-darwin)    expected="PLACEHOLDER_HASH" ;;
        x86_64-unknown-linux-gnu)  expected="PLACEHOLDER_HASH" ;;
        aarch64-unknown-linux-gnu) expected="PLACEHOLDER_HASH" ;;
        x86_64-pc-windows-msvc)    expected="PLACEHOLDER_HASH" ;;
    esac

    if [[ "${expected}" != "PLACEHOLDER_HASH" && -n "${expected}" ]]; then
        local actual
        actual=$(sha256 "${file}")
        if [[ "${actual}" != "${expected}" ]]; then
            echo "ERROR: SHA256 mismatch for ${TARGET}"
            echo "  expected: ${expected}"
            echo "  actual:   ${actual}"
            exit 1
        fi
        echo "SHA256 verified."
    else
        echo "WARNING: No pinned hash for ${TARGET}, skipping verification."
        local actual
        actual=$(sha256 "${file}")
        echo "  SHA256: ${actual}  (pin this in download_rumdl.sh)"
    fi
}

verify_hash "${TMPDIR}/${ARCHIVE}"

echo "Extracting..."
if [[ "${ARCHIVE}" == *.zip ]]; then
    unzip -q "${TMPDIR}/${ARCHIVE}" -d "${TMPDIR}"
else
    tar xzf "${TMPDIR}/${ARCHIVE}" -C "${TMPDIR}"
fi

BINARY=$(find "${TMPDIR}" -name "rumdl${EXT}" -type f | head -1)
if [[ -z "${BINARY}" ]]; then
    echo "ERROR: Could not find rumdl binary in archive"
    exit 1
fi

cp "${BINARY}" "${DEST}"
chmod +x "${DEST}"

echo "Installed rumdl to ${DEST}"
echo "Version: $(${DEST} --version 2>/dev/null || echo 'unknown')"
