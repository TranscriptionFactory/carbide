---
"carbide": patch
---

Security dependency bumps: prosemirror-view 1.42.6 (XSS in paste handling), markdown-it 14.3.2 (quadratic parsing with `linkify` on, which note export, chat and LSP tooltips use), rustls 0.23.45 (TLS 1.3 handshake message validation), and overrides for @xmldom/xmldom 0.8.15, devalue 5.9.3, dompurify 3.4.16, plus build-tool advisories in undici, fast-uri, js-yaml, source-map-js, postcss-selector-parser and vitest.
