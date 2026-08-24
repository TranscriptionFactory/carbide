---
"carbide": minor
---

HTML authoring integration for agents and humans.

- **Behavior change:** bare ` ```html ` fences now auto-render their sandboxed preview on mount instead of showing code-only. Existing notes with html fences will start rendering previews on reopen. Opt out per fence with ` ```html nopreview ` (the preview toggle button persists this token into the fence meta across save/reopen). `xml`/`css`/`js` fences are unchanged and still require the explicit `preview` token.
- New `/html` slash commands: Blank HTML Embed plus three copy-ready starters (stat cards, SVG bar chart, tabs) that insert a preview-enabled html fence. Starters are dependency-free and theme off the carbide/shadcn token fallback chain.
- New "Paste HTML Artifact" slash entry alongside the existing command palette action.
- `docs/html_artifacts.md` now documents inline HTML embeds, starter templates, and the authoring rules (token fallback chain, no network, avoid `color:`/`background:` declarations in fence embeds), pinned by a docs lockstep test.
