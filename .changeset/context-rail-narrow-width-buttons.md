---
"carbide": patch
---

Keep the context rail's panel buttons reachable at narrow window widths

The docked context rail panel declared a 220px minimum width, but the pane it
sits in has its minimum capped as a percentage of the workspace, so below about
a 489px pane group the pane was allocated fewer pixels than the panel demanded.
The pane wrapper hard-clips its overflow, so the trailing controls — the Related
panel's insert-link button and the Metadata panel's edit and delete buttons —
were cut off rather than shown. The panel no longer claims a floor it cannot be
given: its rows keep the action buttons pinned and truncate the note title or
property value instead, and long tags and section headings wrap rather than
pushing the panel wider than the pane.
