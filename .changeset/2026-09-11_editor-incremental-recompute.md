---
"carbide": patch
---

Editor recomputes on each keystroke are now incremental: cursor word/line counts defer to idle time, only code blocks intersecting the changed range re-highlight, and the outline walk is skipped when a transaction touches no heading.
