#!/bin/sh
set -eu

cd "$(dirname "$0")/../.."
pnpm exec svelte-kit sync
pnpm build:excalidraw
pnpm codegen
pnpm build
