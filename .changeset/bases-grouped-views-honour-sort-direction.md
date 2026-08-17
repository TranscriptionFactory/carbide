---
"carbide": patch
---

Fix Bases tree and kanban views ignoring the ASC/DESC toggle

Flipping the sort direction in a Bases view left the tree's groups and the
kanban's columns in the same order. The query itself was fine — rows inside a
group already followed the direction — but both grouping views re-ordered the
groups themselves client-side with a hard-coded ascending comparison, so the
direction never reached the group headers. The toggle now reverses group
ordering in both views.

Two deliberate rules go with it. `(unset)` stays pinned last in both
directions, because it is an absence rather than a value and reads as a footer
either way. A kanban view with a saved column order is intentionally left alone
by the toggle — an explicit column order is an absolute statement about layout.

Also in this area:

- The sort row no longer renders in calendar view, where row order has no
  meaning in a month grid. It still renders in table, list, tree and kanban.
- The sort-property picker offered only Title and Modified. It now lists every
  column the query engine can actually sort by — path, timestamps, size, the
  document statistics and the task rollups — and resolves saved aliases such as
  `modified` and `created` to the column they run against. A seeded view sorted
  by `modified` previously displayed "No sort" while its direction button was
  live.
- Embedded Bases tables no longer show a pointer cursor and hover highlight on
  their column headers, which are not clickable there.
- The panel's refresh button now runs the same refresh action as the command
  palette, so the property list is rebuilt before the query re-runs instead of
  racing it.
