export type CodeMirrorThemeSpec = Record<string, Record<string, string>>;

const SOURCE_EDITOR_BACKGROUND = "var(--editor-source-bg, var(--background))";

export function build_source_editor_base_theme_spec(): CodeMirrorThemeSpec {
  return {
    "&": {
      height: "100%",
      fontSize: "var(--editor-source-font-size, var(--text-sm, 13px))",
      fontWeight: "var(--editor-source-font-weight, 400)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-mono)",
      padding: "var(--editor-padding-block) var(--editor-padding-inline)",
    },
    ".cm-content": {
      maxWidth: "var(--source-editor-max-width, 48rem)",
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
    ".cm-tooltip-lint": {
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      border: "1px solid var(--border)",
    },
    ".cm-diagnostic": {
      color: "var(--popover-foreground)",
    },
    ".cm-diagnosticAction": {
      color: "var(--primary)",
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

export function build_source_editor_syntax_theme_spec(): CodeMirrorThemeSpec {
  return {
    ".cm-content": {
      color: "var(--editor-text, var(--foreground))",
    },
    ".ͼ1 .cm-line": {
      caretColor: "var(--foreground)",
    },
    ".tok-keyword": { color: "var(--source-keyword)" },
    ".tok-string, .tok-string2": { color: "var(--source-string)" },
    ".tok-comment": { color: "var(--source-comment)", fontStyle: "italic" },
    ".tok-heading": {
      color: "var(--source-heading, var(--foreground))",
      fontWeight: "var(--editor-heading-weight, 500)",
    },
    ".tok-meta": { color: "var(--source-meta)" },
    ".tok-link": { color: "var(--source-link, var(--primary))" },
    ".tok-emphasis": {
      color: "var(--source-emphasis, inherit)",
      fontStyle: "italic",
    },
    ".tok-strong": {
      color: "var(--source-strong, var(--foreground))",
      fontWeight: "var(--editor-bold-weight, 600)",
    },
    ".tok-url": {
      color: "var(--source-url)",
      textDecoration: "underline",
      textDecorationColor:
        "color-mix(in oklch, var(--source-url) 40%, transparent)",
    },
    ".tok-atom": { color: "var(--source-atom)" },
    ".tok-number": { color: "var(--source-number)" },
    ".tok-propertyName": { color: "var(--source-property)" },
    ".tok-operator": { color: "var(--source-operator, var(--foreground))" },
    ".tok-punctuation, .tok-bracket": { color: "var(--source-bracket)" },
    ".tok-tagName": { color: "var(--source-tag)" },
    ".tok-attributeName": { color: "var(--source-property)" },
    ".tok-attributeValue": { color: "var(--source-string)" },
    ".tok-invalid": {
      color: "var(--destructive, #f00)",
      textDecoration: "underline wavy",
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
