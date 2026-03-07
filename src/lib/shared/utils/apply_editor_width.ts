function editor_max_width_value(width_ch: number): string {
  return `min(${String(width_ch)}ch, 90%)`;
}

export function apply_editor_width(width_ch: number): void {
  if (typeof document === "undefined") return;

  document.documentElement.style.setProperty(
    "--editor-max-width",
    editor_max_width_value(width_ch),
  );
}
