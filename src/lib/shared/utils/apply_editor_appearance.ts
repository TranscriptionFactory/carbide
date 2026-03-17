import type {
  EditorDividerStyle,
  EditorSettings,
  EditorSpacingDensity,
} from "$lib/shared/types/editor_settings";

const paragraph_spacing_map = {
  extra_compact: "calc(var(--editor-spacing) * 0.6)",
  compact: "calc(var(--editor-spacing) * 0.8)",
  normal: "var(--editor-spacing)",
  relaxed: "calc(var(--editor-spacing) * 1.2)",
  spacious: "calc(var(--editor-spacing) * 1.5)",
} as const;

const list_spacing_map = {
  extra_compact: "calc(var(--editor-spacing) * 0.65)",
  compact: "calc(var(--editor-spacing) * 0.85)",
  normal: "var(--editor-spacing)",
  relaxed: "calc(var(--editor-spacing) * 1.2)",
  spacious: "calc(var(--editor-spacing) * 1.5)",
} as const;

const list_item_spacing_map = {
  extra_compact: "calc(var(--editor-spacing) * 0.1)",
  compact: "calc(var(--editor-spacing) * 0.2)",
  normal: "calc(var(--editor-spacing) * 0.35)",
  relaxed: "calc(var(--editor-spacing) * 0.5)",
  spacious: "calc(var(--editor-spacing) * 0.65)",
} as const;

const code_block_padding_map = {
  extra_compact: "calc(var(--editor-spacing) * 0.5)",
  compact: "calc(var(--editor-spacing) * 0.75)",
  normal: "calc(var(--editor-spacing) * 1)",
  relaxed: "calc(var(--editor-spacing) * 1.25)",
  spacious: "calc(var(--editor-spacing) * 1.5)",
} as const;

const code_block_radius_map = {
  tight: "calc(var(--radius) * 0.5)",
  normal: "calc(var(--radius) * 0.75)",
  soft: "calc(var(--radius) * 1)",
} as const;

const blockquote_padding_map = {
  extra_compact: {
    y: "calc(var(--editor-spacing) * 0.4)",
    x: "calc(var(--editor-spacing) * 0.7)",
  },
  compact: {
    y: "calc(var(--editor-spacing) * 0.6)",
    x: "calc(var(--editor-spacing) * 0.85)",
  },
  normal: {
    y: "calc(var(--editor-spacing) * 0.75)",
    x: "calc(var(--editor-spacing) * 1)",
  },
  relaxed: {
    y: "calc(var(--editor-spacing) * 0.95)",
    x: "calc(var(--editor-spacing) * 1.2)",
  },
  spacious: {
    y: "calc(var(--editor-spacing) * 1.15)",
    x: "calc(var(--editor-spacing) * 1.4)",
  },
} as const;

const divider_style_map: Record<
  EditorDividerStyle,
  { background: string; border_top: string; opacity: string }
> = {
  gradient: {
    background:
      "linear-gradient(90deg, var(--editor-hr-gradient-start), var(--editor-hr-gradient-mid) 50%, var(--editor-hr-gradient-end))",
    border_top: "none",
    opacity: "0.5",
  },
  solid: {
    background: "none",
    border_top: "1px solid var(--editor-hr-gradient-mid)",
    opacity: "0.7",
  },
  dashed: {
    background: "none",
    border_top: "1px dashed var(--editor-hr-gradient-mid)",
    opacity: "0.7",
  },
  dotted: {
    background: "none",
    border_top: "1px dotted var(--editor-hr-gradient-mid)",
    opacity: "0.7",
  },
};

type HeadingMargins = { mt: string; mb: string };
type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
type HeadingSpacingEntry = Record<HeadingLevel, HeadingMargins>;

const heading_spacing_map: Record<EditorSpacingDensity, HeadingSpacingEntry> = {
  extra_compact: {
    h1: {
      mt: "calc(var(--editor-spacing) * 0.75)",
      mb: "calc(var(--editor-spacing) * 0.25)",
    },
    h2: {
      mt: "calc(var(--editor-spacing) * 0.6)",
      mb: "calc(var(--editor-spacing) * 0.2)",
    },
    h3: {
      mt: "calc(var(--editor-spacing) * 0.5)",
      mb: "calc(var(--editor-spacing) * 0.15)",
    },
    h4: {
      mt: "calc(var(--editor-spacing) * 0.4)",
      mb: "calc(var(--editor-spacing) * 0.15)",
    },
    h5: {
      mt: "calc(var(--editor-spacing) * 0.35)",
      mb: "calc(var(--editor-spacing) * 0.1)",
    },
    h6: {
      mt: "calc(var(--editor-spacing) * 0.25)",
      mb: "calc(var(--editor-spacing) * 0.1)",
    },
  },
  compact: {
    h1: {
      mt: "calc(var(--editor-spacing) * 1.25)",
      mb: "calc(var(--editor-spacing) * 0.4)",
    },
    h2: {
      mt: "calc(var(--editor-spacing) * 1.0)",
      mb: "calc(var(--editor-spacing) * 0.35)",
    },
    h3: {
      mt: "calc(var(--editor-spacing) * 0.85)",
      mb: "calc(var(--editor-spacing) * 0.25)",
    },
    h4: {
      mt: "calc(var(--editor-spacing) * 0.7)",
      mb: "calc(var(--editor-spacing) * 0.25)",
    },
    h5: {
      mt: "calc(var(--editor-spacing) * 0.55)",
      mb: "calc(var(--editor-spacing) * 0.2)",
    },
    h6: {
      mt: "calc(var(--editor-spacing) * 0.4)",
      mb: "calc(var(--editor-spacing) * 0.2)",
    },
  },
  normal: {
    h1: {
      mt: "calc(var(--editor-spacing) * 1.75)",
      mb: "calc(var(--editor-spacing) * 0.6)",
    },
    h2: {
      mt: "calc(var(--editor-spacing) * 1.4)",
      mb: "calc(var(--editor-spacing) * 0.5)",
    },
    h3: {
      mt: "calc(var(--editor-spacing) * 1.15)",
      mb: "calc(var(--editor-spacing) * 0.35)",
    },
    h4: {
      mt: "calc(var(--editor-spacing) * 0.95)",
      mb: "calc(var(--editor-spacing) * 0.35)",
    },
    h5: {
      mt: "calc(var(--editor-spacing) * 0.75)",
      mb: "calc(var(--editor-spacing) * 0.25)",
    },
    h6: {
      mt: "calc(var(--editor-spacing) * 0.55)",
      mb: "calc(var(--editor-spacing) * 0.25)",
    },
  },
  relaxed: {
    h1: {
      mt: "calc(var(--editor-spacing) * 2.25)",
      mb: "calc(var(--editor-spacing) * 0.85)",
    },
    h2: {
      mt: "calc(var(--editor-spacing) * 1.85)",
      mb: "calc(var(--editor-spacing) * 0.7)",
    },
    h3: {
      mt: "calc(var(--editor-spacing) * 1.5)",
      mb: "calc(var(--editor-spacing) * 0.5)",
    },
    h4: {
      mt: "calc(var(--editor-spacing) * 1.25)",
      mb: "calc(var(--editor-spacing) * 0.5)",
    },
    h5: {
      mt: "calc(var(--editor-spacing) * 1.0)",
      mb: "calc(var(--editor-spacing) * 0.35)",
    },
    h6: {
      mt: "calc(var(--editor-spacing) * 0.75)",
      mb: "calc(var(--editor-spacing) * 0.35)",
    },
  },
  spacious: {
    h1: {
      mt: "calc(var(--editor-spacing) * 2.75)",
      mb: "calc(var(--editor-spacing) * 1.1)",
    },
    h2: {
      mt: "calc(var(--editor-spacing) * 2.25)",
      mb: "calc(var(--editor-spacing) * 0.9)",
    },
    h3: {
      mt: "calc(var(--editor-spacing) * 1.85)",
      mb: "calc(var(--editor-spacing) * 0.65)",
    },
    h4: {
      mt: "calc(var(--editor-spacing) * 1.5)",
      mb: "calc(var(--editor-spacing) * 0.65)",
    },
    h5: {
      mt: "calc(var(--editor-spacing) * 1.25)",
      mb: "calc(var(--editor-spacing) * 0.45)",
    },
    h6: {
      mt: "calc(var(--editor-spacing) * 0.95)",
      mb: "calc(var(--editor-spacing) * 0.45)",
    },
  },
};

let applied_property_keys: string[] = [];

export function apply_editor_appearance(settings: EditorSettings): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const blockquote_padding =
    blockquote_padding_map[settings.editor_blockquote_padding];
  const headings = heading_spacing_map[settings.editor_heading_spacing_density];
  const divider = divider_style_map[settings.editor_divider_style];

  for (const key of applied_property_keys) {
    root.style.removeProperty(key);
  }

  const entries: [string, string][] = [
    [
      "--editor-paragraph-spacing",
      paragraph_spacing_map[settings.editor_paragraph_spacing_density],
    ],
    [
      "--editor-list-spacing",
      list_spacing_map[settings.editor_list_spacing_density],
    ],
    [
      "--editor-list-item-spacing",
      list_item_spacing_map[settings.editor_list_spacing_density],
    ],
    [
      "--editor-code-block-padding",
      code_block_padding_map[settings.editor_code_block_padding],
    ],
    [
      "--editor-code-block-radius",
      code_block_radius_map[settings.editor_code_block_radius],
    ],
    [
      "--editor-code-block-white-space",
      settings.editor_code_block_wrap ? "pre-wrap" : "pre",
    ],
    ["--editor-blockquote-padding-y", blockquote_padding.y],
    ["--editor-blockquote-padding-x", blockquote_padding.x],
    [
      "--editor-blockquote-border-width",
      `${String(settings.editor_blockquote_border_width)}px`,
    ],
    ["--editor-link-underline-style", settings.editor_link_underline_style],
    ["--editor-hr-background", divider.background],
    ["--editor-hr-border-top", divider.border_top],
    ["--editor-hr-opacity", divider.opacity],
    ["--editor-h1-mt", headings.h1.mt],
    ["--editor-h1-mb", headings.h1.mb],
    ["--editor-h2-mt", headings.h2.mt],
    ["--editor-h2-mb", headings.h2.mb],
    ["--editor-h3-mt", headings.h3.mt],
    ["--editor-h3-mb", headings.h3.mb],
    ["--editor-h4-mt", headings.h4.mt],
    ["--editor-h4-mb", headings.h4.mb],
    ["--editor-h5-mt", headings.h5.mt],
    ["--editor-h5-mb", headings.h5.mb],
    ["--editor-h6-mt", headings.h6.mt],
    ["--editor-h6-mb", headings.h6.mb],
  ];

  if (settings.editor_selection_color.trim() !== "") {
    entries.push(["--editor-selection-bg", settings.editor_selection_color]);
  }

  applied_property_keys = entries.map(([key]) => key);

  for (const [key, value] of entries) {
    root.style.setProperty(key, value);
  }
}
