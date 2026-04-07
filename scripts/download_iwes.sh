#!/usr/bin/env bash
set -euo pipefail

IWES_VERSION="0.0.67"
IWES_DIR="src-tauri/binaries"

TARGET="${1:-$(rustc --print host-tuple)}"
echo "Downloading iwes v${IWES_VERSION} for ${TARGET}..."

mkdir -p "${IWES_DIR}"

BASE_URL="https://github.com/iwe-org/iwe/releases/download/iwe-v${IWES_VERSION}"

if [[ "${TARGET}" == *"windows"* ]]; then
    ARCHIVE="iwe-v${IWES_VERSION}-${TARGET}.zip"
    EXT=".exe"
else
    ARCHIVE="iwe-v${IWES_VERSION}-${TARGET}.tar.gz"
    EXT=""
fi

DOWNLOAD_URL="${BASE_URL}/${ARCHIVE}"
DEST="${IWES_DIR}/iwes-${TARGET}${EXT}"

if [[ -f "${DEST}" ]]; then
    echo "Binary already exists at ${DEST}"
    exit 0
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "${TMPDIR}"' EXIT

echo "Downloading ${DOWNLOAD_URL}..."
curl -sSL -o "${TMPDIR}/${ARCHIVE}" "${DOWNLOAD_URL}"

echo "Extracting..."
if [[ "${ARCHIVE}" == *.zip ]]; then
    unzip -q "${TMPDIR}/${ARCHIVE}" -d "${TMPDIR}"
else
    tar xzf "${TMPDIR}/${ARCHIVE}" -C "${TMPDIR}"
fi

BINARY=$(find "${TMPDIR}" -name "iwes${EXT}" -type f | head -1)
if [[ -z "${BINARY}" ]]; then
    echo "ERROR: Could not find iwes binary in archive"
    exit 1
fi

cp "${BINARY}" "${DEST}"
chmod +x "${DEST}"

echo "Installed iwes to ${DEST}"
echo "Version: $(${DEST} --version 2>/dev/null || echo 'unknown')"
