# Settings & Theme Panel Research

Comparative analysis of theme/appearance settings across otterly, Lokus, and HelixNotes. Goal: identify dramatic departures from otterly's current HSL-heavy, fixed-palette approach.

---

## Current State Comparison

| Feature         | **Otterly**                                                                     | **Lokus**                                            | **HelixNotes**                         |
| --------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| Color input     | 12 fixed swatches + raw HSL fields                                              | Hex/RGB text input per token + table editor          | 8 accent presets (light+dark pairs)    |
| Theme selection | 8 built-in themes, duplicate to customize                                       | 4 built-in + import/export JSON files                | Light/dark/system only                 |
| Typography      | Font dropdown, size/line-height sliders                                         | Sliders + quick presets (Minimal, Comfortable, etc.) | Named presets (Small/Default/Large/XL) |
| Granularity     | Per-element HSL (body text, links, bold, italic, blockquotes, code, highlights) | Per-element color pickers + live preview             | Minimal -- accent + font + size        |
| UX feel         | **Power-user / overwhelming**                                                   | **Power-user but organized**                         | **Simple / opinionated**               |

---

## Otterly Current Implementation

### Theme Settings UI (`theme_settings.svelte`, 929 lines)

**Profile Bar**

- Theme selector dropdown (shows active theme name)
- Action buttons: Duplicate, Delete, Create new theme
- Built-in themes are locked; users must duplicate to customize

**Interface Section**

- Base: Light/Dark toggle
- Sans Font: 10 options (Inter, System UI, SF Pro, Segoe UI, Roboto, Helvetica Neue, Arial, Lato, Open Sans, Source Sans)
- Mono Font: 10 options (JetBrains Mono, Fira Code, SF Mono, Cascadia Code, Source Code Pro, IBM Plex Mono, Consolas, Monaco, Menlo, System Mono)
- Accent Color: Hue slider (0-360 degrees) with live preview dot
- Color Intensity: Chroma slider (0.02-0.3)

**Typography Section**

- Font Size: Slider (0.875-1.25rem)
- Line Height: Slider (1.35-2.1)
- Content Spacing: Dropdown (Extra Compact / Compact / Normal / Spacious / Extra Spacious)
- Body Text: Custom HSL color field with presets + H/S/L inputs
- Links: Custom HSL color field

**Headings Section**

- Color: Dropdown (Inherit, Primary, Accent)
- Weight: Slider (300-700)

**Bold & Italic Section**

- Bold Style: Dropdown (Default [600], Heavier [700], Accent Color)
- Bold Color: Custom HSL color field
- Italic Color: Custom HSL color field

**Blockquotes Section**

- Style: Dropdown (Default, Minimal, Accent Bar)
- Border: Custom HSL color field
- Text: Custom HSL color field

**Inline Code Section**

- Background: Custom HSL color field
- Text: Custom HSL color field

**Code Blocks Section**

- Style: Dropdown (Default, Borderless, Filled)
- Background: Custom HSL color field
- Text: Custom HSL color field

**Highlights Section**

- Background: Custom HSL color field
- Text: Custom HSL color field

### Color Field Component

Each color field includes:

- 12 preset swatches: Warm Gray, Charcoal, Stone, Spruce, Indigo, Rose, Cyan, Amber, Teal, Gold, White, Silver
- Preview circle with border
- Three numeric inputs for H (0-360), S (0-100%), L (0-100%)
- Reset button to revert to defaults

### Color System

OKLch internally (not sRGB): `oklch(lightness chroma hue / opacity)`. Exposed to users as HSL in the UI.

### 8 Built-in Themes (each with light/dark variants)

1. Nordic -- Minimal, professional
2. Brutalist -- High contrast, monospace, sharp edges
3. Neon -- Vibrant, colorful
4. Paper -- Warm parchment, literary, earthy
5. Floating -- Soft shadows, rounded corners, spacious
6. Glass -- Glassmorphism, transparency, frosted
7. Dense -- Compact spacing, smaller font
8. Linear -- Minimalist, clean borders

### Key Files

| File                                                  | Purpose                                    |
| ----------------------------------------------------- | ------------------------------------------ |
| `src/lib/features/settings/ui/theme_settings.svelte`  | Theme customization UI                     |
| `src/lib/shared/types/theme.ts`                       | Theme types, 16 built-in themes            |
| `src/lib/features/theme/application/theme_service.ts` | Theme persistence                          |
| `src/lib/shared/utils/apply_theme.ts`                 | CSS variable injection                     |
| `src/lib/shared/utils/theme_helpers.ts`               | Color presets, font options, HSL utilities |
| `src/lib/reactors/theme.reactor.svelte.ts`            | Reactive theme application                 |
| `src/lib/app/orchestration/ui_store.svelte.ts`        | Theme state (UIStore)                      |

---

## Lokus Implementation

### Theme System Architecture

- Theme files as JSON in `src/themes/` with `name` + `tokens` object
- 4 built-in themes: Lokus Dark, Lokus Light, Rose Pine, Tokyo Night
- 35+ CSS custom properties per theme
- RGB space-separated notation (`--bg: 24 22 31;`) for flexible opacity control

### Preferences UI (`src/views/Preferences.jsx`)

**Appearance Section**

- Theme selector dropdown (built-in + custom)
- Import/Export buttons for custom theme JSON files
- Interactive theme editor: table with token name, color swatch, and hex/RGB text input
- Real-time preview, Save/Reset buttons

**Editor Section**

- Font Family: System UI, serif, monospace, Inter, Roboto, Helvetica, Georgia, Times New Roman, JetBrains Mono
- Font Size: 12-24px slider
- Line Height: 1.2-2.5 slider
- Letter Spacing: -0.05 to +0.1em
- Heading Sizes: Independent H1/H2/H3 sizing (1.5-3.0em)
- Font Weights: Normal, bold, H1/H2/H3 (100-900)
- Quick Presets: Minimal, Comfortable, Compact, Spacious

**Colors Sub-section**

- Expandable per-element color pickers: Text, Heading, Link, Link Hover, Code, Code Background, Blockquote, Blockquote Border, Bold, Italic, Highlight, Highlight Text, Selection

### Notable Design Decisions

- Theme import/export as JSON files
- Quick typography presets alongside granular sliders
- RGB notation enables opacity flexibility without extra tokens
- Multi-layer defaults: built-in -> theme-specific -> live editor overrides
- System dark/light mode listener

### Key Files

| File                        | Purpose                                  |
| --------------------------- | ---------------------------------------- |
| `src/core/theme/manager.js` | Theme load/save/apply/import/export      |
| `src/hooks/theme.jsx`       | React context ThemeProvider + useTheme() |
| `src/themes/*.json`         | Theme definitions                        |
| `src/views/Preferences.jsx` | Settings UI                              |
| `src/styles/globals.css`    | CSS variable definitions                 |
| `src/core/config/store.js`  | Config persistence                       |

---

## HelixNotes Implementation

### Theme System Architecture

- CSS custom properties with `:root` and `:root.dark` selectors
- Only light/dark/system -- no custom themes
- Accent color as the single customization axis (8 presets, each with light+dark variant)

### Settings Panel (`src/lib/components/SettingsPanel.svelte`)

**Styling Tab**

- Theme: Light/Dark/System toggle
- Accent Color: 8 visual swatches (Indigo, Rose, Emerald, Amber, Purple, Cyan, Orange, Teal) -- each with appropriate light and dark mode values
- Font Size: 5 named presets (Small 13px, Default 14px, Medium 15px, Large 16px, XL 18px)
- Line Height: 4 named presets (Tight 1.4, Default 1.6, Relaxed 1.8, Loose 2.0)
- Font Family: 8 options (System, Inter, Georgia, Merriweather, Lora, Open Sans, Literata, Mono)

### Notable Design Decisions

- Extremely simple -- 5 controls total for all appearance settings
- Named presets instead of raw sliders (users pick "Relaxed" not "1.8")
- Accent colors are light/dark-aware pairs, not single values
- No per-element color customization at all
- Settings persisted as JSON via Tauri backend

### Key Files

| File                                      | Purpose                               |
| ----------------------------------------- | ------------------------------------- |
| `src/lib/components/SettingsPanel.svelte` | All settings UI                       |
| `src/app.css`                             | CSS variables (light/dark)            |
| `src/lib/stores/app.ts`                   | Frontend state                        |
| `src/lib/api.ts`                          | Tauri bridge for settings persistence |
| `src-tauri/src/types.rs`                  | AppConfig struct                      |
| `src-tauri/src/commands.rs`               | Settings commands + persistence       |

---

## Pain Points in Otterly's Current Approach

1. **HSL fields are hostile** -- nobody thinks in H/S/L numbers; even designers use hex or visual pickers
2. **12 fixed swatches are limiting** -- arbitrary, don't relate to the active theme's palette
3. **Too many independent color controls** -- 10+ separate HSL field groups for body, links, bold, italic, blockquote border/text, code bg/text, highlight bg/text
4. **No visual preview** -- changes are live but you're staring at form fields, not content
5. **Flat form layout** -- every option equally weighted, no progressive disclosure
6. **No theme import/export** -- unlike Lokus, can't share or back up themes

---

## Brainstorm: Dramatic Departures

### Idea 1: "Mood Board" Theme Builder

Instead of individual color fields, present a visual color palette generator:

- Pick **one accent color** via a proper color wheel/gradient picker (not HSL fields)
- System **auto-derives** all semantic colors (links, headings, bold accent, code bg, highlights) from that accent + light/dark base
- **Live mini-preview panel** (rendered markdown sample) updates in real-time
- Advanced users click individual elements in the preview to override specific colors

### Idea 2: Curated "Vibes" with Fine-Tuning

- Replace 8 built-in themes with **20-30 curated schemes** presented as visual thumbnail cards (mini editor screenshots, not just names)
- One-click to apply; "Customize" button opens focused editor
- Typography as named profiles: "Academic", "Creative Writing", "Technical", "Journal"
- Inspired by HelixNotes' simplicity + Lokus' depth

### Idea 3: Visual Color Wheel + Harmony Modes

- Replace HSL fields with a **proper color wheel** (Figma/Coolors style)
- **Color harmony modes**: complementary, analogous, triadic, split-complementary
- Pick base color, system generates harmonious accent/highlight/link colors
- **Live contrast checker** with WCAG accessibility ratings
- Theme import/export as JSON (from Lokus)

### Idea 4: "Paint by Element" -- Interactive Preview

- Show a **full rendered markdown document** as the settings panel
- Click any element (heading, link, blockquote, code block) to select it
- Floating popover with proper color picker + style controls for just that element
- Eliminates form-heavy approach -- the preview IS the editor

### Idea 5: Practical Remix (Best of Each)

- **From HelixNotes**: Named presets for font size + line height, accent color as visual swatches with light/dark pair awareness
- **From Lokus**: Theme import/export as JSON, quick typography presets, per-token table editor for power users
- **New**: Replace HSL inputs with proper color picker (hex input + visual gradient square + hue slider). Auto-derive related colors from 3-4 chosen primary colors

---

## Recommended Direction: Two-Tier Approach (Idea 1 + 4 Hybrid)

**Tier 1 (default view -- 90% of users stop here):**

- Pick accent color from a visual color wheel
- Auto-generate full palette from accent + base scheme
- Live preview of actual rendered markdown
- Typography via named presets (not raw sliders)

**Tier 2 (expand "Advanced" -- power users):**

- Click elements in the preview to override individual colors with a proper color picker
- Replaces the current wall of HSL fields
- Theme import/export for sharing

This gives otterly HelixNotes-level simplicity by default with Lokus-level depth on demand, while being more visually intuitive than either.
