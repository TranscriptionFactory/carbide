import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import {
  CALLOUT_COLORS,
  canonical_callout_type,
} from "./remark_plugins/remark_callout";

const CALLOUT_ICONS: Record<string, string> = {
  note: "pencil",
  abstract: "clipboard-list",
  info: "info",
  todo: "circle-check",
  tip: "flame",
  success: "check",
  question: "circle-help",
  warning: "triangle-alert",
  failure: "x",
  danger: "zap",
  bug: "bug",
  example: "list",
  quote: "quote",
  important: "message-circle-warning",
};

const CHEVRON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

function icon_svg(name: string): string {
  const icons: Record<string, string> = {
    pencil: `<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>`,
    "clipboard-list": `<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>`,
    info: `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`,
    "circle-check": `<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>`,
    flame: `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`,
    check: `<path d="M20 6 9 17l-5-5"/>`,
    "circle-help": `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`,
    "triangle-alert": `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`,
    x: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
    zap: `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`,
    bug: `<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>`,
    list: `<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>`,
    quote: `<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>`,
    "message-circle-warning": `<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M12 8v4"/><path d="M12 16h.01"/>`,
  };
  const paths = icons[name] ?? icons["pencil"] ?? "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function get_icon_for_type(callout_type: string): string {
  const canonical = canonical_callout_type(callout_type);
  return CALLOUT_ICONS[canonical] ?? "pencil";
}

export const callout_view_plugin_key = new PluginKey("callout-view");

class CalloutBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: ProseNode;
  private icon_el: HTMLElement;
  private toggle_el: HTMLElement;
  private menu_el: HTMLElement | null = null;

  constructor(
    node: ProseNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.node = node;
    const callout_type = (node.attrs["callout_type"] as string) || "note";
    const canonical = canonical_callout_type(callout_type);
    const foldable = node.attrs["foldable"] as boolean;
    const folded = node.attrs["folded"] as boolean;

    this.dom = document.createElement("div");
    this.dom.className = `callout-block callout-block--${canonical}`;
    if (folded) this.dom.classList.add("callout-block--folded");
    this.dom.dataset["callout"] = "";
    this.dom.dataset["calloutType"] = canonical;
    this.dom.dataset["foldable"] = String(foldable);
    this.dom.dataset["defaultFolded"] = String(node.attrs["default_folded"]);
    this.dom.dataset["folded"] = String(folded);
    this.apply_color(node.attrs["callout_color"] as string | null);

    const header = document.createElement("div");
    header.className = "callout-block__header";

    this.icon_el = document.createElement("span");
    this.icon_el.className = "callout-block__icon";
    this.icon_el.contentEditable = "false";
    this.icon_el.title = "Callout settings";
    this.icon_el.innerHTML = icon_svg(get_icon_for_type(callout_type));
    this.icon_el.addEventListener("click", this.handle_icon_click);

    header.appendChild(this.icon_el);

    this.toggle_el = document.createElement("span");
    this.toggle_el.className = "callout-block__toggle";
    this.toggle_el.contentEditable = "false";
    this.toggle_el.innerHTML = CHEVRON_SVG;
    this.toggle_el.style.display = foldable ? "" : "none";
    this.toggle_el.addEventListener("click", this.handle_toggle);
    header.appendChild(this.toggle_el);

    this.contentDOM = document.createElement("div");
    this.contentDOM.className = "callout-block__content";

    this.dom.appendChild(header);
    this.dom.appendChild(this.contentDOM);
  }

  private handle_toggle = () => {
    this.set_attrs({ folded: !this.node.attrs["folded"] });
  };

  private handle_icon_click = () => {
    if (this.menu_el) {
      this.close_menu();
    } else {
      this.open_menu();
    }
  };

  private handle_outside_mousedown = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.menu_el?.contains(target) || this.icon_el.contains(target)) {
      return;
    }
    this.close_menu();
  };

  private set_attrs(patch: Record<string, unknown>) {
    const pos = this.getPos();
    if (pos == null) return;
    const tr = this.view.state.tr.setNodeMarkup(pos, null, {
      ...this.node.attrs,
      ...patch,
    });
    this.view.dispatch(tr);
  }

  private apply_color(color: string | null) {
    if (color) {
      this.dom.style.setProperty("--callout-color", color);
      this.dom.dataset["calloutColor"] = color;
    } else {
      this.dom.style.removeProperty("--callout-color");
      delete this.dom.dataset["calloutColor"];
    }
  }

  private open_menu() {
    const menu = document.createElement("div");
    menu.className = "callout-block__menu";
    menu.contentEditable = "false";
    this.render_menu(menu);
    this.dom.appendChild(menu);
    this.menu_el = menu;
    document.addEventListener("mousedown", this.handle_outside_mousedown, true);
  }

  private close_menu() {
    this.menu_el?.remove();
    this.menu_el = null;
    document.removeEventListener(
      "mousedown",
      this.handle_outside_mousedown,
      true,
    );
  }

  private render_menu(menu: HTMLElement) {
    menu.replaceChildren();
    const active_type = canonical_callout_type(
      (this.node.attrs["callout_type"] as string) || "note",
    );
    const active_color = this.node.attrs["callout_color"] as string | null;
    const foldable = this.node.attrs["foldable"] as boolean;

    const types = document.createElement("div");
    types.className = "callout-block__menu-types";
    for (const [type, icon] of Object.entries(CALLOUT_ICONS)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "callout-block__menu-type";
      if (type === active_type) {
        btn.classList.add("callout-block__menu-type--active");
      }
      btn.title = type;
      btn.innerHTML = icon_svg(icon);
      btn.addEventListener("click", () =>
        this.set_attrs({ callout_type: type }),
      );
      types.appendChild(btn);
    }
    menu.appendChild(types);

    const swatches = document.createElement("div");
    swatches.className = "callout-block__menu-swatches";
    const default_btn = document.createElement("button");
    default_btn.type = "button";
    default_btn.className =
      "callout-block__menu-swatch callout-block__menu-swatch--default";
    if (!active_color) {
      default_btn.classList.add("callout-block__menu-swatch--active");
    }
    default_btn.title = "Default";
    default_btn.addEventListener("click", () =>
      this.set_attrs({ callout_color: null }),
    );
    swatches.appendChild(default_btn);
    for (const color of CALLOUT_COLORS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "callout-block__menu-swatch";
      if (color === active_color) {
        btn.classList.add("callout-block__menu-swatch--active");
      }
      btn.style.backgroundColor = color;
      btn.title = color;
      btn.addEventListener("click", () =>
        this.set_attrs({ callout_color: color }),
      );
      swatches.appendChild(btn);
    }
    menu.appendChild(swatches);

    const fold_btn = document.createElement("button");
    fold_btn.type = "button";
    fold_btn.className = "callout-block__menu-fold";
    fold_btn.setAttribute("aria-pressed", String(foldable));
    const fold_label = document.createElement("span");
    fold_label.textContent = "Collapsible";
    const fold_state = document.createElement("span");
    fold_state.textContent = foldable ? "On" : "Off";
    fold_btn.append(fold_label, fold_state);
    fold_btn.addEventListener("click", () =>
      this.set_attrs(
        foldable
          ? { foldable: false, default_folded: false, folded: false }
          : { foldable: true },
      ),
    );
    menu.appendChild(fold_btn);
  }

  update(updated: ProseNode): boolean {
    if (updated.type.name !== "callout") return false;
    this.node = updated;
    const callout_type = (updated.attrs["callout_type"] as string) || "note";
    const canonical = canonical_callout_type(callout_type);
    const foldable = updated.attrs["foldable"] as boolean;

    this.dom.className = `callout-block callout-block--${canonical}`;
    if (updated.attrs["folded"]) {
      this.dom.classList.add("callout-block--folded");
    }
    this.dom.dataset["calloutType"] = canonical;
    this.dom.dataset["foldable"] = String(foldable);
    this.dom.dataset["defaultFolded"] = String(updated.attrs["default_folded"]);
    this.dom.dataset["folded"] = String(updated.attrs["folded"]);
    this.apply_color(updated.attrs["callout_color"] as string | null);
    this.toggle_el.style.display = foldable ? "" : "none";
    this.icon_el.innerHTML = icon_svg(get_icon_for_type(callout_type));
    if (this.menu_el) this.render_menu(this.menu_el);
    return true;
  }

  stopEvent(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof Node)) return false;
    if (this.menu_el?.contains(target)) return true;
    if (this.toggle_el.contains(target)) return true;
    return this.icon_el.contains(target);
  }

  ignoreMutation(
    mutation: MutationRecord | { type: "selection"; target: Node },
  ): boolean {
    if (mutation.type === "selection") return false;
    return !this.contentDOM.contains(mutation.target);
  }

  destroy() {
    this.close_menu();
    this.icon_el.removeEventListener("click", this.handle_icon_click);
    this.toggle_el.removeEventListener("click", this.handle_toggle);
  }
}

export function create_callout_view_prose_plugin(): Plugin {
  return new Plugin({
    key: callout_view_plugin_key,
    props: {
      nodeViews: {
        callout(node, view, getPos) {
          return new CalloutBlockView(
            node,
            view,
            getPos as () => number | undefined,
          );
        },
      },
    },
  });
}
