export function apply_editor_width(readable_line_length: boolean): void {
  if (typeof document === "undefined") return;

  const style = document.documentElement.style;
  if (readable_line_length) {
    style.removeProperty("--editor-max-width");
    style.removeProperty("--source-editor-max-width");
    return;
  }
  style.setProperty("--editor-max-width", "none");
  style.setProperty("--source-editor-max-width", "none");
}
