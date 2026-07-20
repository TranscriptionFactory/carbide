export function find_scroll_container(
  start: HTMLElement | null,
): HTMLElement | null {
  let el: HTMLElement | null = start;
  while (el) {
    const overflow_y = getComputedStyle(el).overflowY;
    if (overflow_y === "auto" || overflow_y === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}
