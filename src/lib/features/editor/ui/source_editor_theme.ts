export type CodeMirrorThemeSpec = Record<string, Record<string, string>>;

const SOURCE_EDITOR_BACKGROUND = "var(--editor-source-bg, var(--background))";

export function build_source_editor_base_theme_spec(): CodeMirrorThemeSpec {
  return {
    "&": {
      height: "100%",
      fontSize: "var(--text-sm, 13px)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-mono)",
      padding: "2rem clamp(1rem, 4%, 3rem)",
    },
    ".cm-content": {
      maxWidth: "48rem",
      margin: "0 auto",
      caretColor: "var(--foreground)",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      borderRight: "1px solid var(--border)",
      color: "var(--muted-foreground)",
      opacity: "0.5",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      opacity: "1",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in oklch, var(--muted) 30%, transparent)",
    },
    ".cm-selectionBackground": {
      backgroundColor:
        "color-mix(in oklch, var(--primary) 20%, transparent) !important",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--foreground)",
    },
    ".cm-lint-marker-error": {
      content: "'!'",
    },
    ".cm-lint-marker-warning": {
      content: "'!'",
    },
  };
}

export function build_source_editor_background_theme_spec(): CodeMirrorThemeSpec {
  return {
    "&": {
      backgroundColor: SOURCE_EDITOR_BACKGROUND,
    },
  };
}

export function build_source_editor_hide_line_numbers_theme_spec(): CodeMirrorThemeSpec {
  return {
    ".cm-lineNumbers": {
      display: "none",
    },
  };
}
