const AFFORDANCE_MAP: Record<string, { attr: string; fallback: string }> = {
  "--statusbar-shape": { attr: "data-statusbar-shape", fallback: "bar" },
  "--tab-active-indicator": {
    attr: "data-tab-indicator",
    fallback: "underline",
  },
  "--sidebar-active-shape": {
    attr: "data-sidebar-active",
    fallback: "ribbon",
  },
};

function strip_css_quotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function apply_affordances(): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const style = getComputedStyle(root);

  for (const [prop, { attr, fallback }] of Object.entries(AFFORDANCE_MAP)) {
    const raw = style.getPropertyValue(prop);
    const value = raw ? strip_css_quotes(raw) : "";
    root.setAttribute(attr, value || fallback);
  }
}
