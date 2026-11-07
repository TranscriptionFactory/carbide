import alpine_source from "alpinejs/dist/cdn.min.js?raw";
import tailwind_source from "@tailwindcss/browser?raw";

const THEME_COLORS: Record<string, string> = {
  background: "var(--carbide-bg, #ffffff)",
  foreground: "var(--carbide-fg, #18181b)",
  card: "var(--carbide-bg, #ffffff)",
  "card-foreground": "var(--carbide-fg, #18181b)",
  popover: "var(--carbide-bg, #ffffff)",
  "popover-foreground": "var(--carbide-fg, #18181b)",
  primary: "var(--carbide-accent, #2563eb)",
  "primary-foreground": "var(--carbide-accent-fg, #ffffff)",
  secondary: "var(--carbide-code-bg, #f4f4f5)",
  "secondary-foreground": "var(--carbide-fg, #18181b)",
  muted: "var(--carbide-code-bg, #f4f4f5)",
  "muted-foreground": "var(--carbide-muted-fg, #71717a)",
  accent: "var(--carbide-code-bg, #f4f4f5)",
  "accent-foreground": "var(--carbide-fg, #18181b)",
  destructive: "#dc2626",
  "destructive-foreground": "#ffffff",
  border: "var(--carbide-border, #e4e4e7)",
  input: "var(--carbide-border, #e4e4e7)",
  ring: "var(--carbide-accent, #2563eb)",
  selected: "var(--accent, var(--carbide-accent, #2563eb))",
  "selected-foreground":
    "var(--accent-foreground, var(--carbide-accent-fg, #ffffff))",
};

const THEME_MAP = `<style type="text/tailwindcss" data-carbide-live-theme>
:root { --selected: var(--accent, var(--carbide-accent, #2563eb)); }
@theme inline {
${Object.entries(THEME_COLORS)
  .map(([name, fallback]) => `--color-${name}: var(--${name}, ${fallback});`)
  .join("\n")}
--font-sans: var(--carbide-font-sans, ui-sans-serif, system-ui, sans-serif);
--font-mono: var(--carbide-font-mono, ui-monospace, monospace);
}
</style>`;

function inline_runtime(name: string, source: string): string {
  // HTML parses script end tags even inside JavaScript strings and comments.
  return `<script data-carbide-live-runtime="${name}">${source.replace(/<\/script/gi, "<\\/script")}</script>`;
}

export function build_live_html_runtime(content: string): {
  head: string;
  body: string;
} {
  const uses_alpine =
    /\bx-data(?:\s|=|>)/i.test(content) || content.includes("alpine:init");
  const uses_theme_classes =
    /(?:bg|text|border|ring|outline|fill|stroke)-(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring|selected)\b/.test(
      content,
    );
  if (!uses_alpine && !uses_theme_classes) return { head: "", body: "" };

  const scripts = content.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) ?? [];
  const owns_alpine = scripts.some(
    (script) =>
      /\bsrc\s*=\s*(?:"[^"]*alpine|'[^']*alpine|[^\s"'>]*alpine)/i.test(
        script,
      ) ||
      /(?:window\s*\.\s*Alpine\s*=|\bAlpine\s*\.\s*start\s*\(|\bimport\s+Alpine\b)/.test(
        script,
      ),
  );
  return {
    head: THEME_MAP + inline_runtime("tailwind", tailwind_source),
    body: owns_alpine
      ? ""
      : inline_runtime(
          "alpine",
          `(function(){var start=function(){if (!window.Alpine) {${alpine_source}\n}};if(document.readyState === "loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();})();`,
        ),
  };
}
