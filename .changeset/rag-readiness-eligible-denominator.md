---
"carbide": patch
---

The chat index banner no longer says "indexing" forever. Readiness is now measured against the notes the embedding pass can actually embed, so a vault holding attachments, code files or empty notes reaches ready once the pass completes, instead of waiting on a count it could never satisfy. A pass that ends with eligible notes still unembedded — unembeddable content, a failed encode, an unavailable model — reports `partial` once as "N of M notes embedded (K skipped)" without a spinner, and a later attempt clears it back to ready without switching vault or provider.
