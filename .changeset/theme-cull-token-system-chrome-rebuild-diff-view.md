---
"carbide": minor
---

Themes: culled to 5 kept blueprints with a migration fallback for removed
themes; all 14 theme-*.css files are deleted and kept themes are static
`[data-theme]` blocks. New accent identity purple `#7e1dfb`, hand-tuned
Carbide Light/Dark, and a lint-enforced token-only theme contract.

Tokens: chrome type scale with density-wired sizes, canonical `--shadow-1..3`
elevation scale with hairline seams, radius scale aligned to 4/6/8/12, and a
motion budget (120–200ms micro-interactions, 1s ambient). Bundled Inter and
IBM Plex Mono now render by default.

Chrome: activity bar, tab bar, and editor status bar rebuilt (24px controls,
density/indicator spec, Tolaria badge suite with compact mode); bottom panel
rebuilt on shadcn Tabs with roving tabindex; context rail on 24px controls
with hairline dividers; breadcrumb is a divider-free 28px row; the find bar
floats as a popover overlay at the top-right of the editor.

Layout: layout presets are independent of themes, panels render docked or
overlay, zen-mode guards consolidated into a single `show_chrome` flag,
sidebar views are registry-driven, and all pane sizes persist across restart.
The right-panel exclusion is enforced and FloatingOutline is removed.

Editor: Tab is trapped inside the hand-rolled overlays, the omnibar and slash
menu ignore incidental mouse hover via an intentional-movement guard, empty
states are uniform, and chrome text is no longer selectable by default.

Outline: built off the keystroke path with idle debouncing and now resolves
the real scroll container.

Git: note-relative diff view toggle for the active tab, including a
working-tree comparison mode.
