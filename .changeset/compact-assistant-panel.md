---
"carbide": patch
---

Fit more of the conversation into the assistant panel

The assistant tab spent a lot of its height on padding. Messages sat 16px apart,
the composer reserved a 64px box for a one-line prompt, body prose was set at a
line-height of 1.625, and two stacked horizontal rules separated the transcript
from the input. At the panel's default height that left room for very little
conversation, and scrolling was the only way to read a reply of any length.

Spacing across the panel now matches the Problems panel — the densest surface
the app already ships — so the same panel height shows noticeably more of the
transcript. Message body text stays at its current size: prose here is read at
length, so only the line spacing tightened. The header, scroll area, message
stack, user bubbles, tool-call chips and composer all draw tighter, the two
rules above the composer are now one, and the header and scope-bar buttons drop
from 28px to 24px to match.

The panel's default height is unchanged, and this is not tied to the
Compact/Regular/Airy appearance setting — the assistant tab is simply denser
than it was.
