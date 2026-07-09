---
"carbide": minor
---

Search: omnibar sort modes (relevance/name/recency) and kind filters
(notes/commands/settings) on top of the existing file-type filters, with
Kind and Sort rows in the filter overlay, mnemonics, and removable active
chips; kind filters also apply to the empty-query MRU list.

Fixes: code-block HTML previews render via the carbide-html: protocol
instead of CSP-blocked srcdoc iframes, tab scroll position restores after
the buffer swap instead of being clobbered by it, duplicate
--editor-code-bg token no longer trips the settings token search, and
macOS titlebar drags work over themes that reposition the workspace
layout.
