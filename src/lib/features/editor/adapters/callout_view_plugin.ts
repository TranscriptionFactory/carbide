import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import {
  CALLOUT_COLORS,
  CALLOUT_ICONS,
  callout_icon_for_type,
  callout_icon_svg,
  canonical_callout_type,
} from "$lib/features/editor/domain/callout";
import { unwrap_callout_at } from "./block_transforms";

const CHEVRON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

export const callout_view_plugin_key = new PluginKey("callout-view");

class CalloutBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: ProseNode;
  private icon_el: HTMLElement;
  private toggle_el: HTMLButtonElement;
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
    this.icon_el.innerHTML = callout_icon_svg(
      callout_icon_for_type(callout_type),
    );
    this.icon_el.addEventListener("click", this.handle_icon_click);

    header.appendChild(this.icon_el);

    this.toggle_el = document.createElement("button");
    this.toggle_el.type = "button";
    this.toggle_el.className = "callout-block__toggle";
    this.toggle_el.contentEditable = "false";
    this.toggle_el.setAttribute("aria-label", "Toggle callout fold");
    this.toggle_el.setAttribute("aria-expanded", String(!folded));
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
      btn.innerHTML = callout_icon_svg(icon);
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
    fold_btn.className = "callout-block__menu-action callout-block__menu-fold";
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

    const remove_btn = document.createElement("button");
    remove_btn.type = "button";
    remove_btn.className =
      "callout-block__menu-action callout-block__menu-remove";
    remove_btn.textContent = "Remove callout";
    remove_btn.addEventListener("click", () => this.unwrap());
    menu.appendChild(remove_btn);
  }

  private unwrap() {
    const pos = this.getPos();
    if (pos == null) return;
    this.close_menu();
    unwrap_callout_at(pos, this.view.state, this.view.dispatch);
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
    this.toggle_el.setAttribute(
      "aria-expanded",
      String(!updated.attrs["folded"]),
    );
    this.icon_el.innerHTML = callout_icon_svg(
      callout_icon_for_type(callout_type),
    );
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
