---
"carbide": minor
---

### Features

- **Menu-bar tray icon + close-to-hide (headless-capable MCP)**: Carbide can now keep running with its window closed, reachable from a macOS menu-bar icon, so the in-process MCP server on `:3457` and the `carbide mcp` CLI stay live without an open window. Gated behind a new `app.closeToTray` setting (default off, preserving today's close=quit behavior). The tray menu shows the MCP server status, a **"Keep running in menu bar"** checkbox that persists the flag, **Show Carbide**, and **Quit Carbide**. With the flag on, the window close button hides the window instead of exiting; Cmd+Q / Quit still exit fully. The dock icon is retained. Settings service gains sync `set_setting_value`/`get_setting_value` cores plus a pure, unit-tested `read_bool` helper so the tray handler persists without an async runtime.
