---
"carbide": patch
---

Slash menu, tag and cite suggestions, the code-fence language picker and embedded `query / `base / ```tasks suggestions accept on Enter again. `handleKeyDown`handlers stop at the first one that returns true, and these menus were registered after the core keymap, so`baseKeymap`claimed Enter first: in a fence it inserted a newline, in prose it split the block. Inside a fence, Tab and the arrows now reach an open suggestion list instead of indenting or inserting an exit paragraph. Suggestions opened with`[[` are still affected: that menu is registered by a different extension and was left alone.
