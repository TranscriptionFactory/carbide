---
"carbide": minor
---

feat(editor): inline-mark syntax reveal + 5-branch editor/UI bug batch

- **Inline mark syntax reveal**: Obsidian-style delimiter reveal for inline marks — markdown delimiters show while the caret/selection touches the mark and hide otherwise.
- **Shortcuts & clipboard**: Mod-Enter toggles callout fold (toggle is a real button, code-block escape keeps precedence); AI/RAG/query inputs submit only on unmodified Enter (no more modifier/IME-triggered generation); shifted punctuation hotkeys normalize via `event.code` so `CmdOrCtrl+Shift+\`` (terminal toggle) matches; new highlight formatting command on Mod-Alt-h with toolbar button; copy block writes a rich pm-slice clipboard payload (text/html + markdown) built synchronously in the gesture so paste resolves native; shared KbdHint marks hidden Cmd/Ctrl+Enter submit affordances.
- **Gutter & layout**: block drag handle moved into a reserved in-box gutter and enlarged; px floors enforced for right rail and outline panes; dark-mode contrast fixed for sandboxed HTML embeds.
- **Inline AI in source view**: inline AI menu now anchors and executes correctly in source view.
- **Panel stability**: chatrag duplicate-key crash fixed; plugin panels keep alive across switches; clip-dialog focus restored.
