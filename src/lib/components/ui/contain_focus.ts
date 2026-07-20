import type { Action } from "svelte/action";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const contain_focus: Action<HTMLElement> = (node) => {
  const prev = document.activeElement as HTMLElement | null;

  const focusables = () => [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];

  queueMicrotask(() => {
    if (!node.contains(document.activeElement)) focusables()[0]?.focus();
  });

  function on_keydown(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  node.addEventListener("keydown", on_keydown);

  return {
    destroy() {
      node.removeEventListener("keydown", on_keydown);
      const active = document.activeElement;
      if (
        (active === document.body || node.contains(active)) &&
        prev?.isConnected
      ) {
        prev.focus();
      }
    },
  };
};
