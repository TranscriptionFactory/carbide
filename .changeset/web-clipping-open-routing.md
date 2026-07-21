---
"carbide": minor
---

Clip web page: new palette command fetches a URL, extracts readable content,
and saves any combination of markdown note (default), HTML artifact, and EPUB.
Images are downloaded into the vault (capped at 20, 5MB each) so clipped pages
never need re-fetching; failed images keep their remote URL and are counted in
the completion toast. Clipped notes and artifacts carry source/clipped-at
provenance.

Security: plugin HTTP fetch now re-validates every redirect hop (max 5)
against SSRF rules, closing a redirect-to-private-address bypass, and blocks
IPv6 ULA, link-local, and IPv4-mapped private addresses.

Routing: omnibar results and graph nodes now open through the centralized
note_open route, so non-markdown files consistently open in the document
viewer from every entry point.
