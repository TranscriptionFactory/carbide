# Live-HTML Remote Scripts/Styles — Implementation Plan

**Date:** 2026-06-24
**Status:** Proposed
**Area:** `document` feature — live HTML rendering (`carbide-html://` scheme)

## Problem

Live HTML documents (trust tiers `live` and `live+net`) cannot load JavaScript or
stylesheets from a CDN. The live-mode CSP omits `https:` from `script-src` and
`style-src` in **both** enforcement points, so a page like
`carbide/geometric_frontier_2026.html` (Tailwind CDN + Chart.js CDN + Google Fonts
`@import`) renders with broken layout and blank `<canvas>` charts even at the most
permissive tier.

This is incoherent: in `live+net` we already grant `script-src 'unsafe-inline'
'unsafe-eval'` **and** `connect-src *`, so any inline script can already
`fetch(url).then(r => r.text()).then(eval)`. The current rule blocks the honest
declarative form (`<script src>`) while permitting the evasive form — breaking
legitimate artifacts without stopping a malicious one.

## Goal

In the **`live+net` tier only**, allow remote scripts and stylesheets over `https:`.
Leave `safe` and `live` (no-network) behavior unchanged. Fold in the CSP
deduplication so the Rust header and the injected meta tag can no longer drift.

### Non-goals

- No change to the `safe` tier (sanitized, scripts/styles stripped).
- No remote scripts/styles in the no-network `live` tier — that tier stays a real
  "runs code, cannot phone home" guarantee.
- **No origin allowlist.** The containment boundary is the sandbox
  (`allow-scripts` without `allow-same-origin`), not an origin list; allowlisting is
  a maintenance treadmill with illusory security (see prior analysis).
- No "snapshot remote deps at trust-time" work — that is the durable reproducibility
  follow-up, tracked separately, not part of this change.
- `http:` is **not** added to `script-src`/`style-src` (executable code/styles over
  plaintext is an avoidable MITM vector). Passive `img/font/media-src` keep their
  existing `http:` allowance untouched.

## Decision-tree alignment (`docs/architecture.md`)

This modifies an existing IO/native-serving path plus a pure domain function; it adds
no new ports, stores, reactors, or actions.

- **Native serving / IPC** → `src-tauri/src/shared/live_html.rs` (shared serving for
  the `carbide-html://` custom protocol + the `html_live_register` command).
- **Pure transform** → `build_live_csp()` lives in
  `src/lib/features/document/domain/html_live_document.ts` (domain, no IO) — correct
  home for policy construction.
- **Tier source** → already derived in
  `src/lib/features/document/ui/document_viewer_content.svelte:48`; no change needed.

Pre-existing deviation (left as-is, surgical scope): `html_live_renderer.svelte`
calls `invoke()` directly rather than through an adapter. We only add one argument to
the existing call; we do **not** refactor it here.

## Canonical CSP policy (single source of truth)

Both emitters must produce exactly these directive sets. This table is the spec; the
tests on both sides pin to it.

**Common to both tiers**

```
default-src 'none'
img-src     data: blob: https: http: carbide-html:
font-src    data: https: http: carbide-html:
media-src   data: blob: https: http: carbide-html:
frame-src   data: blob:
```

**Tier-varying**

| Directive    | `live` (no network)                     | `live+net`                                       |
| ------------ | --------------------------------------- | ------------------------------------------------ |
| `script-src` | `'unsafe-inline' 'unsafe-eval' blob: data:` | `'unsafe-inline' 'unsafe-eval' blob: data: https:` |
| `style-src`  | `'unsafe-inline' data:`                 | `'unsafe-inline' data: https:`                   |
| `connect-src`| `'none'`                                | `*`                                              |

Changes vs. today:

1. `script-src` / `style-src` gain `https:` **only** in `live+net` (the feature).
2. Rust header `connect-src` becomes tier-aware (was hardcoded `*`) — fixes the
   header lying about the no-network guarantee.
3. TS meta `img/font/media-src` gain `carbide-html:` to match the header — repairs
   local-asset loading under CSP intersection.

`script-src`/`style-src` intentionally do **not** include `carbide-html:` (no
local-file script/style execution use-case; adding it would be a capability change in
the no-net tier).

## Scenarios & invariants (BDD)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `safe` tier renders the page | scripts + `<style>` stripped (unchanged) |
| 2 | `live` tier, remote `<script src="https://…">` | **blocked** (`script-src` has no `https:`) |
| 3 | `live` tier, remote `@import`/`<link>` stylesheet | **blocked** (`style-src` has no `https:`) |
| 4 | `live` tier, any `fetch()`/XHR | **blocked** (`connect-src 'none'` at header *and* meta) |
| 5 | `live+net` tier, remote `<script src="https://…">` | **loads & runs** |
| 6 | `live+net` tier, remote stylesheet / Google Fonts `@import` | **loads** |
| 7 | `live+net` tier, `fetch()` | allowed (`connect-src *`, unchanged) |
| 8 | Any tier, `<script src="http://…">` (plaintext) | **blocked** (only `https:` added) |
| 9 | Local asset via `asset_root` (`<img src="pic.png">`) | renders in both live tiers (meta now allows `carbide-html:`) |
| 10 | Header CSP vs. meta CSP for a given tier | identical directive sets (parity) |
| 11 | iframe sandbox tokens | exactly `allow-scripts` (no `allow-same-origin`) — containment invariant |

## File-by-file changes

### 1. `src-tauri/src/shared/live_html.rs`

- **`Entry`** (line 15): add `allow_network: bool`.
- **`LiveHtmlStore::register`** (line 26): signature →
  `register(&self, html: String, asset_root: Option<PathBuf>, allow_network: bool)`;
  store the flag in `Entry`.
- **`get_html`** (line 48): return `Option<(Vec<u8>, bool)>` (bytes + `allow_network`)
  so the handler can pick the tier. Update the 3 test call sites.
- **`live_html_csp`** (line 136): `live_html_csp(allow_network: bool) -> String`
  (now owned). Emit the canonical policy above; gate `script-src`/`style-src` `https:`
  and `connect-src` on the flag.
- **`build_html_response`** (line 191): take `allow_network: bool`, pass it to
  `live_html_csp`.
- **`handle_live_html_request`** (line 147): fetch `(bytes, allow_network)` from
  `get_html`, pass the flag to `build_html_response`. (404/400 error paths unchanged —
  they use `error_response`.)
- **`html_live_register`** command (line 246): add `allow_network: bool` param; thread
  it into `register`. → command signature change ⇒ **regen bindings**.

### 2. `src/lib/features/document/domain/html_live_document.ts`

- **`build_live_csp(allow_network)`** (line 7): add `https:` to `script-src` and
  `style-src` when `allow_network`; add `carbide-html:` to `img/font/media-src` to
  match the header. `connect-src` gating stays. Output must equal the canonical table.

### 3. `src/lib/features/document/ui/html_live_renderer.svelte`

- **`invoke("html_live_register", …)`** (line 54): add `allowNetwork: network` to the
  payload (`network` already in scope at line 36).

### 4. `src/lib/generated/bindings.ts`

- Regenerated, not hand-edited. `html_live_register` payload becomes
  `{ html, assetRoot, allowNetwork }`.

## Test plan

### Rust (`live_html.rs` `#[cfg(test)]`)

- `csp_live_omits_https_from_scripts_and_styles` — `live_html_csp(false)` has no
  `https:` in `script-src`/`style-src` and `connect-src 'none'`.
- `csp_livenet_allows_https_scripts_and_styles` — `live_html_csp(true)` includes
  `https:` in both and `connect-src *`.
- `csp_never_allows_http_for_scripts_or_styles` — neither tier has `http:` in
  `script-src`/`style-src`.
- `handler_emits_tier_csp_header` — register with `allow_network=true` vs `false`;
  assert the response `Content-Security-Policy` header matches the tier.
- Update existing `register(...)`/`get_html(...)` call sites for the new signatures.

### TS (`tests/unit/...` for `domain/html_live_document`)

- `build_live_csp(false)` and `build_live_csp(true)` assert against the canonical
  strings (mirrors the Rust tests — both pin to this document's policy table).
- Assert `connect-src 'none'` vs `*`, `https:` presence/absence, `carbide-html:` in
  `img/font/media-src`.

### Parity / drift guard

A true cross-runtime assertion isn't feasible (can't import Rust into Vitest). Both
suites pin to the **same canonical strings** in this doc, and each emitter gets a
source comment pointing at the other + this plan. Drift in one without the other
fails that side's pinned test.

### Containment invariant

Add/verify a test that `html_live_renderer.svelte`'s `SandboxedIframe` sandbox is
exactly `allow-scripts` (never `allow-same-origin`) — this is the load-bearing
boundary that makes remote code acceptable.

### Manual acceptance

Open `carbide/geometric_frontier_2026.html` at `live+net`: both charts render and
Tailwind layout applies. At `live`: layout/charts stay broken (CDN blocked), nav
toggling still works. Local-asset doc renders an `<img>` from `asset_root`.

## Validation commands

```bash
cd src-tauri && cargo check                 # Rust types
cd src-tauri && cargo test live_html         # CSP + handler tests (do NOT run bare `cargo fmt`)
cd src-tauri && cargo test export_bindings    # regen bindings.ts after signature change
pnpm check                                    # Svelte/TS
pnpm test html_live                            # TS CSP tests
npx oxlint src/lib/features/document src/lib/features/document/ui/html_live_renderer.svelte   # scope lint to touched files (whole-repo lint OOMs)
pnpm format
```

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Remote code execution in `live+net` | Opt-in tier (explicit user trust); sandbox without `allow-same-origin` → no access to app DOM/IPC/storage; no ambient authority to steal. Capability is not broader than the existing `unsafe-eval` + `connect-src *`. |
| Future weakening of the iframe sandbox | Invariant test #11 fails loudly if `allow-same-origin` is ever added. |
| CSP drift between Rust/TS | Both pinned to the canonical table; tier-aware header removes the loose `connect-src *`. |
| Plaintext-`http:` script injection | Only `https:` added to `script-src`/`style-src`. |

## Out-of-scope follow-up (roadmap)

**Snapshot-on-trust:** generalize the mermaid/KaTeX prerender pass to fetch + inline +
hash-pin remote deps when network trust is granted. Solves reproducibility/longevity
(documents render offline and identically over time) — the one thing this CSP change
does not address. Separate plan.

## Task checklist

- [ ] Rust: `Entry` + `register` + `get_html` carry `allow_network`
- [ ] Rust: `live_html_csp(bool)` + `build_html_response` + handler tier-aware
- [ ] Rust: `html_live_register` command takes `allow_network`
- [ ] TS: `build_live_csp` adds `https:` (live+net) + `carbide-html:` (img/font/media)
- [ ] Svelte: pass `allowNetwork` to `html_live_register` invoke
- [ ] Regen `bindings.ts`
- [ ] Rust CSP/handler tests + TS CSP tests + sandbox invariant test
- [ ] Manual acceptance on `geometric_frontier_2026.html`
- [ ] `cargo check` / `pnpm check` / `pnpm test` / scoped lint / `pnpm format`
