---
"carbide": patch
---

The slash menu, tag and cite suggestions, wiki-link suggestions opened with `[[`, the code-fence language picker, and the `query`, `base`, and `tasks` fence suggestions accept on Enter again. Keydown handlers stop at the first one that claims a key, and these menus were registered after the core keymap, so the core Enter binding ran first: in a fence it inserted a newline, in prose it split the block. Inside a fence, Tab and the arrows now reach an open suggestion list instead of indenting or leaving the block, and Shift+Tab still outdents while a list is open.
