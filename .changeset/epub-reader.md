---
"carbide": minor
---

Add EPUB reading and make books findable in vault search.

- New EPUB reader in the document viewer (vendored `foliate-js` engine): renders reflowable and fixed-layout books, with a table-of-contents sidebar, internal-link navigation, prev/next paging, an in-book search, a reading-progress indicator, and theme-following light/dark styling.
- Reader preferences in Settings → Documents: reading mode (scrolled by default, or paginated), columns, text width, font size, and line spacing — applied live.
- Resume-where-you-left-off: reading position persists per vault in `.carbide/reading_positions.json` (relative path → CFI) and is restored on reopen.
- Security: book content renders in same-origin `blob:` iframes (required for pagination) with book JavaScript neutralized by a strict per-document CSP (`script-src 'none'`) and script resources blocked at load — the inverse of the trusted-HTML posture, by design.
- Vault full-text search now indexes EPUBs (title + spine body text), so a phrase from a book surfaces in the omnibar, and `[label](book.epub)` links resolve as attachments — mirroring the existing HTML/PDF paths.
