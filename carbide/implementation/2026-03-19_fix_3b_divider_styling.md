---
title: "3B — Divider (HR) styling: thickness, color, spacing"
date: 2026-03-19
status: implemented
bug_ref: "3B"
---

## Problem

Horizontal rule (`<hr>`) styling was limited to 4 style presets (gradient, solid, dashed, dotted). Users had no control over thickness, color, or vertical spacing.

## Solution

Added three new configurable settings for horizontal rules.

### New settings

| Setting                       | Type                   | Default              | Range                  |
| ----------------------------- | ---------------------- | -------------------- | ---------------------- |
| `editor_divider_thickness_px` | `number`               | `1`                  | 1–5 px (slider)        |
| `editor_divider_color`        | `string`               | `""` (theme default) | Any CSS color          |
| `editor_divider_spacing`      | `EditorSpacingDensity` | `"normal"`           | extra_compact–spacious |

### Implementation

1. **Types** — Added fields to `EditorSettings`, defaults in `DEFAULT_EDITOR_SETTINGS`, entries in `GLOBAL_ONLY_SETTING_KEYS` and `SETTINGS_COMPARE_KEYS`.

2. **CSS variable pipeline** — `apply_editor_appearance()` now pushes:
   - `--editor-hr-thickness` (from thickness setting)
   - `--editor-hr-spacing` (from spacing density map)
   - `--editor-hr-gradient-mid` override when custom color is non-empty (affects all 4 divider styles uniformly)

3. **CSS** — `editor.css` HR rule updated to consume `var(--editor-hr-thickness)` for height and `var(--editor-hr-spacing)` for margins. `divider_style_map` border-top strings updated to use `var(--editor-hr-thickness, 1px)`.

4. **Settings UI** — Three new controls in the Dividers section: thickness slider (1–5), color text input with placeholder, spacing density select dropdown.

### Files changed

- `src/lib/shared/types/editor_settings.ts`
- `src/lib/shared/utils/apply_editor_appearance.ts`
- `src/styles/editor.css`
- `src/lib/features/settings/ui/settings_dialog.svelte`
- `src/lib/features/settings/application/settings_actions.ts`
- `tests/unit/utils/apply_editor_appearance.test.ts`
