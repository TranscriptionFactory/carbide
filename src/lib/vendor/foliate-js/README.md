# foliate-js (vendored)

Vendored from <https://github.com/johnfactotum/foliate-js> (MIT).

- **Upstream commit:** `78914aef4466eb960965702401634c2cb348e9b1`
- **Vendored on:** 2026-06-17

foliate-js is the rendering engine behind the [Foliate](https://github.com/johnfactotum/foliate)
reader. Carbide uses it to render EPUBs in `epub_viewer.svelte`. Upstream has no
npm release and recommends vendoring/submodule; we copy the source tree pinned to
the commit above. See `../LICENSE` style note: the upstream `LICENSE` is kept here
verbatim.

## What is vendored

Only the modules on the **EPUB rendering path** are copied, to keep the auditable
surface of this security-sensitive dependency (it renders untrusted book content)
as small as possible:

```
view.js          epub.js          epubcfi.js
paginator.js     fixed-layout.js  progress.js
overlayer.js     text-walker.js   search.js
vendor/zip.js    LICENSE
```

Deliberately **not** vendored: the MOBI/KF8 (`mobi.js`), FB2 (`fb2.js`), comic-book
(`comic-book.js`), and PDF (`pdf.js` + `vendor/pdfjs/`) format adapters; the TTS,
dictionary, OPDS, and quote-image modules; the demo reader (`reader.*`, `ui/`);
and `vendor/fflate.js` (used only by MOBI/dict). Carbide renders PDFs with its own
`pdfjs-dist` viewer, so foliate's bundled PDF.js is not needed.

## Local patches

`view.js` is the only file with logic changes (all marked with `Carbide patch:`):

1. `makeBook` dispatches **EPUB only** (zip → `EPUB`). The upstream CBZ/FBZ/PDF/MOBI/FB2
   branches and the `isPDF`/`isCBZ`/`isFB2`/`isFBZ` helpers are removed, since their
   format adapters are not vendored.
2. The `initTTS` method is removed (it dynamically imported the non-vendored `tts.js`).

These patches keep Vite's static dynamic-import analysis resolvable (every remaining
`import('./…')` points at a vendored file).

## Security posture

EPUB content is rendered in a same-origin `blob:` iframe (foliate measures/paginates
content, which requires same-origin access). Book scripts are neutralized by injecting
a strict `Content-Security-Policy` (`script-src 'none'`) into every section document
via the book's `transformTarget` hook — see `epub_viewer.svelte`. This is the inverse
of Carbide's trusted-HTML posture and matches foliate's documented requirement: never
render a book without a script-blocking CSP.

## Updating

Re-copy the file list above from the new upstream commit, re-apply the two `view.js`
patches and the two `paginator.js` reflow guards (search `Carbide patch` in each
file), update the commit hash + date here, and re-run `pnpm check`/`pnpm build`.

The `paginator.js` guards make `Paginator.render()` and `View.expand()` no-op when the
section iframe is detached or mid-navigation (its `contentDocument`/`<body>` is null).
The container `ResizeObserver` can fire during a section swap, before the next `blob:`
document has parsed its `<body>`; without the guards `setStylesImportant(doc.body, …)`
throws `Cannot destructure property 'style' from null`.
