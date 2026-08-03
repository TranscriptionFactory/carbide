---
"carbide": patch
---

feat(assistant): run presence follows you into the inline menu and the chat header

The run kernel already tracked every AI run, but the only place to see one was the
status bar popover. Presence now sits where the work is started: the inline AI menu and
the Vault Chat header both show the same indicator, with the same Stop on each listed
run.

The presence label now names the provider of the newest active run, so `claude · 2 runs`
tells you what is actually working rather than only how much.

While an inline edit streams, the menu shows a Stop for that specific run — the newest
active run of kind `inline`, never a chat or agent run that happens to be in flight at
the same time.

The Vault Chat header no longer disappears when the chat is empty, so presence and
**New chat** stay reachable from a fresh panel.
