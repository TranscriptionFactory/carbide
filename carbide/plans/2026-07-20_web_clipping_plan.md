# Web Clipping (F1) — Design & Implementation

Status: implemented on `feat/web-clipping` (2026-07-20 batch, F1).
Origin: F1 in the 2026-07-20 bug/feature report ("no web clipping or
URL-to-note import feature exists"), deferred there pending a design pass —
this document is that pass, as built.

## Summary

`Clip web page` (command palette) opens a dialog: URL + target folder +
output formats (one or more of **Markdown note** (default), **HTML
artifact**, **EPUB**). The pipeline fetches the page once, extracts the
readable article, downloads images into the vault, then emits every selected
format from the same extracted content. The primary output (note > artifact
> epub) opens when the clip finishes.

## Pipeline

```
clip_fetch_page (Rust, SSRF-checked, charset-aware)
  → extract_readable_content (@mozilla/readability, <base href> injected,
     <body> fallback — clip never hard-fails on extraction)
  → plan_image_localization (collect img[src], absolutize, http(s)-only,
     dedupe, cap 20)
  → per image: clip_fetch_asset (5 MB cap, image content-type or magic
     sniff) → AssetsPort.write_image_asset (same byte-flow as paste)
  → rewrite_image_srcs per output target
  → emit: markdown (html_to_markdown + clip frontmatter → uniquified path →
     NoteService.import_markdown_file)
        | html artifact (sanitize_html → DocumentService.save_html_artifact
     w/ clip provenance {source: url} — banner renders "Source: url · date")
        | epub (XMLSerializer XHTML → clip_write_epub, hand-rolled EPUB3
     via the in-tree zip crate; images embedded from vault asset paths)
```

Failed image downloads keep their remote URL and are surfaced as a count in
the success toast. `.html`/`.epub` outputs are viewable by the existing
document viewer with zero new viewer work.

## Security

- `fetch_checked` (plugin/http_fetch.rs): manual redirect loop (≤5 hops)
  through a no-redirect client; every hop runs `check_ssrf` + async DNS
  re-validation (`Policy::custom` is sync, so reqwest's built-in redirect
  handling cannot do this). This also fixes a pre-existing
  redirect-to-private bypass in `plugin_http_fetch`, which now routes
  through the same helper.
- `is_private_ip` extended: IPv6 ULA `fc00::/7` + link-local `fe80::/10`.
- Page cap 10 MB, asset cap 5 MB, non-HTML page content types rejected,
  non-image assets rejected (content-type or png/jpeg/gif/webp magic).
- Artifact HTML is sanitized before saving; markdown goes through
  `html_to_markdown`; EPUB content is the same sanitized-pipeline content
  serialized as XHTML.

## Shared seam (rationale)

`localize_images.ts` (`plan_image_localization` / `rewrite_image_srcs`) is
deliberately a standalone domain primitive exported from the clip feature
index. It is the designated shared seam for:

- **Snapshot-on-trust** — the follow-up in
  `carbide/plans/2026-06-24_live_html_remote_scripts_plan.md` (downloading
  remote refs of trusted live HTML docs into the vault).
- **Tier-3 self-contained export** in
  `carbide/plans/2026-05-29_html_doc_parity_plan.md`.

Both need "collect remote refs → fetch → rewrite to local paths"; clip is
the first consumer. `clip_fetch_asset` is the matching backend primitive.

## Decisions

- **Readability** (@mozilla/readability 0.6.0, pinned): reference
  implementation of Firefox reader mode; DOMParser is free in the webview.
  Extraction failure falls back to `<body>` — a clip should degrade, not
  fail.
- **EPUB hand-rolled** over a crate: `zip` is already in-tree and
  `epub_extractor` already demonstrates + tests the container format. Zero
  new Rust deps; the roundtrip test uses `epub_extractor` as its oracle.
- **Sequential asset fetches** mirror the existing paste byte-flow through
  `AssetsPort.write_image_asset`; batch Rust-side fetching is a non-goal
  until profiling says otherwise.
- **Service-to-service injection** (ClipService gets NoteService +
  DocumentService): layering-legal and the only way to reuse the
  import/save pipelines without duplicating them.
- `save_html_artifact` gained an optional trailing `provenance` param
  (default: existing clipboard provenance) — existing caller untouched.

## BDD scenarios

| # | Scenario | Expected | Covered by |
|---|----------|----------|------------|
| 1 | Clip w/ markdown format | note at `<folder>/<slug>.md`, frontmatter title/date_created/source/clipped_at, opens in editor | clip_service.test, clip_note.test |
| 2 | Clip w/ HTML format | sanitized artifact + provenance sidecar `{source: url}`, banner "Source: url · date" | clip_service.test |
| 3 | Clip w/ EPUB format | EPUB3 at `<folder>/<slug>.epub`, roundtrips through epub_extractor, opens in viewer | clip_service.test, Rust epub_roundtrips_through_extractor |
| 4 | All three formats, one clip | page fetched once, shared stem, 3 outputs, primary = note | clip_service.test (fetch-once) |
| 5 | No format selected | confirm disabled | clip_web_page_dialog.test |
| 6 | Invalid / non-http(s) URL | confirm disabled; `is_valid_clip_url` rejects | clip_note.test, dialog test |
| 7 | SSRF: private IP, localhost, IPv6 ULA/link-local | fetch rejected in Rust | http_fetch tests |
| 8 | SSRF: redirect to private target | rejected per-hop by fetch_checked | http_fetch tests (redirect_to_private_target_fails_ssrf_check) |
| 9 | Non-UTF-8 page (charset param or sniff) | decoded correctly | Rust decode tests (latin1 + sniff) |
| 10 | Image fetch fails | remote URL kept, toast reports N failed | clip_service.test |
| 11 | Caps | 20 images max, 5 MB/asset, 10 MB/page | localize_images.test (cap), Rust caps |
| 12 | Title collision | `-2` suffix via uniquify_note_path | clip_service.test |
| 13 | Network/page error | error toast, no partial outputs | clip_service.test |
| 14 | Redirect chain > 5 hops | rejected | fetch_checked hop cap |
| 15 | Extraction failure (trivial page) | falls back to body, still clips | extract_readable_content.test |

## Non-goals

Full-page archival/snapshot-on-trust (separate roadmap; primitive shared),
CSS/font/script localization, srcset variants (dropped; `ponytail:` marker
in rewrite_image_srcs), browser-extension capture, auth/paywalled/
JS-rendered SPA content (server HTML only — documented limitation),
scheduled re-clipping, batch Rust-side asset fetching, clipboard-URL
autofill.
