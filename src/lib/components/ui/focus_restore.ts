type AutoFocusHandler = (event: Event) => void;

export function create_prevent_scroll_focus_restore() {
  let pre_focused: HTMLElement | null = null;

  return {
    handle_open(event: Event, handler?: AutoFocusHandler) {
      pre_focused =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      handler?.(event);
    },
    handle_close(event: Event, handler?: AutoFocusHandler) {
      handler?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (pre_focused && document.contains(pre_focused)) {
        pre_focused.focus({ preventScroll: true });
      }
      pre_focused = null;
    },
  };
}
