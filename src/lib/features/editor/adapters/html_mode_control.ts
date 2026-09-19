import type { HtmlRenderMode } from "../domain/inline_html_mode";

export type HtmlModeControl = {
  el: HTMLElement;
  set_mode: (mode: HtmlRenderMode) => void;
};

const MODE_LABELS: Record<HtmlRenderMode, string> = {
  safe: "Safe",
  live: "Live",
};
const MODE_TITLES: Record<HtmlRenderMode, string> = {
  safe: "Render without running scripts",
  live: "Run scripts (sandboxed, trust required)",
};

export function create_html_mode_control(
  mode: HtmlRenderMode,
  on_select: (mode: HtmlRenderMode) => void,
): HtmlModeControl {
  const el = document.createElement("div");
  el.className = "html-mode-toggle";
  el.contentEditable = "false";
  el.setAttribute("role", "radiogroup");
  el.setAttribute("aria-label", "HTML render mode");

  const buttons: Record<HtmlRenderMode, HTMLButtonElement> = {
    safe: document.createElement("button"),
    live: document.createElement("button"),
  };

  for (const key of ["safe", "live"] as const) {
    const button = buttons[key];
    button.className = "html-mode-toggle__btn";
    button.type = "button";
    button.textContent = MODE_LABELS[key];
    button.title = MODE_TITLES[key];
    button.setAttribute("role", "radio");
    button.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      on_select(key);
    });
    el.appendChild(button);
  }

  function set_mode(next: HtmlRenderMode): void {
    for (const key of ["safe", "live"] as const) {
      const active = key === next;
      buttons[key].classList.toggle("html-mode-toggle__btn--active", active);
      buttons[key].setAttribute("aria-checked", String(active));
    }
  }

  set_mode(mode);

  return { el, set_mode };
}
