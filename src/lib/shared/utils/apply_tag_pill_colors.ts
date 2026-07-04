const STYLE_ELEMENT_ID = "tag-pill-color-styles";

function escape_css_string(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function build_tag_pill_css(colors: Record<string, string>): string {
  return Object.entries(colors)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([tag, color]) =>
        `.tag-pill[data-tag="${escape_css_string(tag)}" i] { --tag-pill-color: ${color}; }`,
    )
    .join("\n");
}

export function apply_tag_pill_colors(colors: Record<string, string>): void {
  let element = document.getElementById(STYLE_ELEMENT_ID);
  if (!(element instanceof HTMLStyleElement)) {
    element = document.createElement("style");
    element.id = STYLE_ELEMENT_ID;
    document.head.appendChild(element);
  }
  element.textContent = build_tag_pill_css(colors);
}
