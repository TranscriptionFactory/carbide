---
"carbide": patch
---

fix(ai): chat sources and markdown links now open their notes

Agent-mode citations kept the absolute paths harness CLIs report and dropped the structured path list the backend sends precisely because the JSON input summary truncates — so clicking a source toasted "Note no longer exists". Citations are now derived from the structural tool paths and normalized to vault-relative before lookup.

Plain markdown links in AI responses were rendered as real anchors that nothing intercepted. Clicks are now routed: relative links open the note in the workspace, external URLs open in the system browser, and fragment-only or malformed-URI hrefs are handled safely instead of navigating the webview.
