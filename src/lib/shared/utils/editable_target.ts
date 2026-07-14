export function is_editable_target(el: HTMLElement): boolean {
  return (
    el.isContentEditable ||
    el.closest(".ProseMirror, .cm-editor, input, textarea") !== null
  );
}
