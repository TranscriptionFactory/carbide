---
"carbide": minor
---

### Bug Fixes

- **Omni-search freeze**: Replaced quadratic DP with a rolling window approach, debounced file filter computation, and switched to O(1) index lookups to eliminate UI freezes on large vaults

### Maintenance

- Updated vendor/iwe pin to e578d236
- Removed git-crypt configuration
