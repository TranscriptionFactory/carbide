---
"carbide": patch
---

fix(ui): keep the keyboard selection visible in the omnibar and suggest dropdowns

Arrowing past the visible fold moved the highlight out of view with no scrolling, in both the file list and `>` command mode. The selected row now scrolls into view as you move through it.

The same fix is applied to the folder suggest input, the property combobox, and the vault switcher dropdown.
