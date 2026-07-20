export type TokenCategory = {
  label: string;
  tokens: string[];
};

export function dedupe_category_tokens(
  categories: TokenCategory[],
): TokenCategory[] {
  return categories.map((cat) => ({
    ...cat,
    tokens: [...new Set(cat.tokens)],
  }));
}

const RAW_CATEGORIES: TokenCategory[] = [
  {
    label: "Colors",
    tokens: [
      "--background",
      "--foreground",
      "--card",
      "--card-foreground",
      "--popover",
      "--popover-foreground",
      "--secondary",
      "--secondary-foreground",
      "--muted",
      "--muted-foreground",
      "--border",
      "--input",
      "--primary",
      "--primary-foreground",
      "--accent",
      "--accent-foreground",
      "--destructive",
    ],
  },
  {
    label: "Accent Scale",
    tokens: [
      "--accent-50",
      "--accent-100",
      "--accent-200",
      "--accent-300",
      "--accent-400",
      "--accent-500",
      "--accent-600",
      "--accent-700",
      "--accent-800",
      "--accent-900",
    ],
  },
  {
    label: "Interactive",
    tokens: [
      "--interactive",
      "--interactive-hover",
      "--interactive-muted",
      "--interactive-bg",
      "--interactive-bg-hover",
      "--interactive-border-subtle",
      "--interactive-text-on-bg",
    ],
  },
  {
    label: "Surfaces",
    tokens: [
      "--background-surface-2",
      "--background-surface-3",
      "--foreground-tertiary",
      "--border-strong",
      "--border-subtle",
    ],
  },
  {
    label: "Focus & Selection",
    tokens: ["--focus-ring", "--selection-bg", "--ring"],
  },
  {
    label: "Sidebar",
    tokens: [
      "--sidebar",
      "--sidebar-foreground",
      "--sidebar-primary",
      "--sidebar-primary-foreground",
      "--sidebar-accent",
      "--sidebar-accent-foreground",
      "--sidebar-border",
      "--sidebar-ring",
    ],
  },
  {
    label: "Activity Bar",
    tokens: ["--activity-bar-bg", "--activity-bar-fg"],
  },
  {
    label: "Tabs",
    tokens: [
      "--tab-active-bg",
      "--tab-active-fg",
      "--tab-inactive-bg",
      "--tab-inactive-fg",
      "--tab-border",
      "--tab-active-indicator-color",
      "--tab-active-indicator-thickness",
    ],
  },
  {
    label: "Status Bar",
    tokens: ["--statusbar-bg", "--statusbar-fg", "--statusbar-divider"],
  },
  {
    label: "Shadows",
    tokens: [
      "--shadow-1",
      "--shadow-2",
      "--shadow-3",
      "--shadow-color",
    ],
  },
  {
    label: "Spacing",
    tokens: [
      "--space-0-5",
      "--space-1",
      "--space-1-5",
      "--space-2",
      "--space-2-5",
      "--space-3",
      "--space-4",
      "--space-5",
      "--space-6",
      "--space-8",
      "--space-10",
      "--space-12",
    ],
  },
  {
    label: "Typography",
    tokens: [
      "--text-2xs",
      "--text-xs",
      "--text-chrome",
      "--text-sm",
      "--text-base",
      "--text-md",
      "--text-lg",
      "--font-family-sans",
      "--font-family-mono",
    ],
  },
  {
    label: "Sizes",
    tokens: [
      "--size-icon-xs",
      "--size-icon-sm",
      "--size-icon-md",
      "--size-icon-lg",
      "--size-touch-xs",
      "--size-touch-sm",
      "--size-touch-md",
      "--size-touch-lg",
      "--size-activity-bar",
      "--size-control",
      "--size-status-bar",
      "--size-tree-row",
      "--size-dialog-lg",
      "--size-dialog-xl",
    ],
  },
  {
    label: "Editor",
    tokens: [
      "--editor-background",
      "--editor-foreground",
      "--editor-heading",
      "--editor-gutter",
      "--editor-selection",
      "--editor-code-bg",
      "--editor-heading-1",
      "--editor-heading-2",
      "--editor-heading-3",
      "--editor-heading-4",
      "--editor-heading-5",
      "--editor-heading-6",
      "--editor-checkbox-size",
      "--editor-font-size",
      "--editor-line-height",
      "--editor-spacing",
      "--editor-heading-color",
      "--editor-heading-weight",
      "--editor-text",
      "--editor-bold-color",
      "--editor-italic-color",
      "--editor-link",
      "--editor-blockquote-border",
      "--editor-blockquote-text",
      "--editor-code-block-text",
      "--editor-code-inline-bg",
      "--editor-code-inline-text",
      "--editor-mark-bg",
      "--editor-mark-text",
    ],
  },
  {
    label: "Scrollbar",
    tokens: [
      "--scrollbar-width",
      "--scrollbar-thumb",
      "--scrollbar-thumb-hover",
    ],
  },
  {
    label: "Transitions",
    tokens: [
      "--duration-fast",
      "--duration-normal",
      "--duration-slow",
      "--duration-ambient",
    ],
  },
  {
    label: "Borders",
    tokens: ["--radius"],
  },
  {
    label: "Z-Index",
    tokens: ["--z-dropdown", "--z-sticky"],
  },
  {
    label: "Warning",
    tokens: [
      "--warning",
      "--warning-bg",
      "--warning-text-on-bg",
      "--warning-border",
    ],
  },
  {
    label: "Status",
    tokens: ["--indicator-dirty", "--indicator-clean"],
  },
];

export const CATEGORIES: TokenCategory[] =
  dedupe_category_tokens(RAW_CATEGORIES);
