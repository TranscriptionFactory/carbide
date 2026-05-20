---
"carbide": minor
---

### Features

- **Boolean operator support for task queries**: Added `FilterExpr` type with AND/OR/NOT combinators for task filtering. Parentheses required after NOT to avoid clashing with `not done` keyword. Includes Rust unit tests for `build_filter_sql` and `FilterExpr` deserialization.

- **Vault context for AI**: Added vault context types, settings, and prompt builder support. Wired vault context into AI service, actions, and UI. Added vault context settings UI controls with tests. Simplified vault context code for cleaner layering.

### Fixes

- **Task SQL builder**: Added `starts_with` operator and fixed `readVaultFile` call.
