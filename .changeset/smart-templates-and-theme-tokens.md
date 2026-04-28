---
"carbide": minor
---

### Smart templates

- Template library plugin with built-in and custom templates
- Template picker UI with search and categorized browsing
- Template settings panel for managing custom templates

### Three-tier token system

- Added `tokens.css` (Tier 1) and `themes.css` (Tier 2) foundation layers
- Affordance mirror (`apply_affordances`) with tests for Tier 3 token propagation
- Rewired editor components, tab bar, and status bar to Tier 3 tokens
- Affordance contract CSS connecting Tier 2 semantic tokens to Tier 3 component tokens
- Added `css_theme` and `density` settings fields with `BP_TERMINAL` blueprint
- Tests for css_theme, density, and FOUC cache fields

### Theme UI

- Replaced theme gallery grid with grouped Select dropdown
- Removed duplicate Editor tab from theme advanced panel
