---
"carbide": minor
---

feat(editor): recents in the @ palette, same-day related links, and context-rail layout fixes

- **@ palette recents**: a bare `@` now opens on a "Recently edited" section instead of showing no notes at all — the MRU list merged with the most recently modified notes, filtered as you type, resolved in-memory with no IPC. The free `r:` prefix scopes the palette to recents.
- **Created this day**: the Related tab gains a "Created this day" section listing notes created or modified on the same calendar day as the open note's creation date, derived client-side from note metadata.
- **Same-day smart link rule**: the `same_day` rule compared modification times on both sides despite being named for creation. It now anchors on the source note's creation day and matches a candidate's creation _or_ modification day, so a note drafted alongside the anchor but edited later is finally suggested.
- **Context rail**: the docked rail no longer clips its right edge on narrow windows (its minimum pane width may now claim up to 45%); the spotlight/theater overlay panel stops short of the icon strip so the rail's tabs stay visible and clickable; and the `tasks` rail tab — which rendered a blank panel because TaskPanel lives in the sidebar — now routes `Cmd+Alt+T` and the task view-mode commands to the sidebar view instead.
