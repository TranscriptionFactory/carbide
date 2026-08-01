---
"carbide": minor
---

feat(mcp): serve app and plugin documentation as MCP resources

The MCP server advertised no resources and returned an empty list — the handlers were stubs. Connected assistants can now discover and read Carbide's own documentation instead of guessing at its features.

- App guides are served at `carbide://help/{slug}` and the bundled docs ship with the app.
- Each installed plugin exposes help at `carbide://plugin/{id}/help`, serving its README when it has one and falling back to its manifest description and settings schema when it does not.
- The `resources` capability is advertised during initialization, so clients know to ask.

Plugin authors can point at a docs file from the plugin manifest; this is documented in the plugin guide. Also reconciles four bundled plugins that were missing from the packaged resources.
