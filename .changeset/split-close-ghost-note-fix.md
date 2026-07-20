---
"carbide": patch
---

Tabs: closing the active tab no longer leaves a ghost note in the editor pane.
With a split open, closing a primary tab now activates the most recent tab in
the same pane (instead of hopping to the secondary pane by MRU), pane focus
follows the tab that takes over, and when the last primary tab closes the
primary editor clears instead of continuing to render the closed note.
