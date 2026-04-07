#!/usr/bin/env bash
set -euo pipefail

RUMDL_VERSION="0.1.59"
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
curl -fsSL --connect-timeout 30 --max-time 300 --retry 3 --retry-delay 5 \
    -o "${TMPDIR}/${ARCHIVE}" "${DOWNLOAD_URL}"

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
        aarch64-apple-darwin)      expected="abebb21d20687b2e4716a885a332444dd904eb36b5484c4176783d5850d48576" ;;
        x86_64-apple-darwin)       expected="7e3b1f283341f241b3d9e89fc4f30bc2d5c459eedfb95592dd403f5af782f1c4" ;;
        x86_64-unknown-linux-gnu)  expected="44415ba79bfaf089f3e81c1a60dbbec99464b0bfe2169b541337cb62cd829533" ;;
        x86_64-pc-windows-msvc)    expected="a584c0683e07e48c8b214d9a71dfbdba79f232081165b7885ea942b8bc278248" ;;
    esac

    if [[ -n "${expected}" ]]; then
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
