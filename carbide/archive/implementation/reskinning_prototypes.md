# Carbide Reskinning Prototypes: UX Archetypes Plan

This document outlines the strategy for exploring diverse UI/UX appearances for Carbide, moving beyond simple color schemes to structural and aesthetic transformations.

## 1. UX Archetypes (Mockup Concepts)

### A. "The Monolith" (Ultra-Minimalist / Focus-Driven) - [IMPLEMENTED]

- **Visual Philosophy**: Total immersion. No sidebar by default. Everything is a floating overlay or a transient command.
- **Key Structural Changes**:
  - **Activity Bar**: Hidden in monolith mode (accessible via shortcuts).
  - **Sidebar**: Hidden in monolith mode (accessible via shortcuts).
  - **StatusBar/TabBar**: Hidden in monolith mode for maximum focus.
  - **Typography**: Serif fonts (Newsreader) for the editor, Monospace (JetBrains Mono) for UI.
  - **Implementation**:
    - New `layout_variant: "monolith"` added to `Theme` type.
    - Conditional rendering in `WorkspaceLayout.svelte`.
    - `src/styles/theme-monolith.css` for floating editor aesthetics.
    - BUILTIN themes added: "Monolith Light" and "Monolith Dark".

### B. "The Terminal" (Cyberpunk / TUI-Inspired)

- **Visual Philosophy**: High-density, retro-futuristic, scan-line aesthetics.
- **Key Structural Changes**:
  - **Borders**: Thick, blocky borders (`2px solid`) with sharp corners (`radius: 0`).
  - **Grid**: A subtle background dot-grid or scan-line overlay.
  - **Components**: Always-visible blocky scrollbars. Breadcrumbs styled as raw file paths (`/vault/notes/idea.md`).
  - **Accent**: High-chroma amber or "Phosphor Green."

### C. "The Workbench" (Industrial / Skeuomorphic-Modern) - [IMPLEMENTED]

- **Visual Philosophy**: Tactile and structured. Inspired by high-end physical hardware or audio equipment (DAWs).
- **Key Structural Changes**:
  - **Panels**: Deep inset shadows to make the editor feel "sunken" into the workbench.
  - **Tabs**: Blocky, industrial tabs with sharp borders.
  - **StatusBar**: Dashboard-like display with monospaced text and uppercase labels.
  - **Buttons**: Tactile feedback with physical "press" effect and drop-shadows.
  - **Scrollbars**: Thick, blocky, and always visible for an industrial aesthetic.
  - **Implementation**:
    - New `layout_variant: "workbench"` added.
    - `src/styles/theme-workbench.css` for structural skeuomorphism.
    - BUILTIN themes added: "Workbench Light" and "Workbench Dark".

---

## 2. Implementation Strategy for "The Monolith"

### Phase 1: Structural Layout Overrides

- Introduce `layout_variant: "monolith"` to the theme engine.
- Modify `WorkspaceLayout.svelte` to conditionally hide the `Sidebar.Provider` and `ActivityBar`.
- Create a "Command Strip" component that merges Status Bar info with Activity Bar actions at the bottom of the viewport.

### Phase 2: Aesthetic Refinement

- **Typography**: Set default editor font to a high-quality Serif stack.
- **Transitions**: Slow, graceful fades for UI elements that appear on-demand.
- **Shadows**: Use large, soft shadows (`--shadow-lg`) for floating palettes to create depth against the "Monolith" background.

### Phase 3: Interactive Discovery

- Implement a "Ghost Sidebar" trigger: Hovering within 10px of the left edge reveals a minimal, translucent navigation strip.
- Map `Cmd+B` to toggle the visibility of the "Command Strip" at the bottom.

---

## 3. Verification & Testing

- [ ] Ensure `zen_mode` still functions correctly as a subset of the Monolith layout.
- [ ] Verify keyboard navigation (Omnibar, Tab switching) remains accessible without visible UI chrome.
- [ ] Test contrast ratios for floating overlays against various editor backgrounds.
