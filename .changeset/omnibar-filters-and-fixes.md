---
"carbide": minor
---

### Omnibar filter mode + query persistence

- Tab-triggered filter overlay with mnemonic chips for file type filtering (Markdown, PDF, Code, Drawing, Images) and source scope (Vault/All)
- Query, scope, and filters persist across open/close within a session
- Shift+Tab progressively clears filters then query; text auto-selected on reopen
- Fixed auto-select re-firing on every render, causing typed text to be overwritten

### Graph view fixes

- Route non-markdown files (PDFs, etc.) to document viewer instead of forcing markdown open
- Resolve @linked/... virtual paths to real file paths before opening documents

### Performance

- Git push/fetch/pull/push_with_upstream made async with spawn_blocking to avoid blocking the UI thread
- Removed redundant git_status calls in commit and push flows
- Cached find_remote("origin") in git_status
- Added timeouts to git_add_remote/git_set_remote_url
