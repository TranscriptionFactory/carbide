---
"carbide": patch
---

### Fixes

- **Formatting marks now inclusive with universal escape**: Removed `inclusive: false` from code_inline, strikethrough, and highlight marks so users can extend them by typing at the boundary (matching bold/italic behavior). Updated mark escape plugin to escape from all user-facing formatting marks on ArrowRight.

- **Prevent `.carbide/` folder creation in browse mode**: Added backend guards on Tauri write commands to reject writes when vault is in browse mode. Frontend plugin lifecycle reactor now skips `initialize_active_vault` for non-vault modes. `smart_links::config::load_rules` returns defaults in-memory without writing when config file is missing.
