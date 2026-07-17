---
"carbide": patch
---

Git: remote failures now surface a real error message — git stderr is captured
instead of dropped, and toasts fall back to a sensible message when the error
string is empty.

Editor: markdown that can't be converted is preserved as raw nodes instead of
being silently dropped, callout dividers no longer fuse into setext headings,
and raw_inline marks pass `undefined` rather than `null`.
