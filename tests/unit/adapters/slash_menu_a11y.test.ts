/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import {
  create_commands,
  create_menu_el,
  render_items,
  type SlashCommand,
  type SlashState,
} from "$lib/features/editor/adapters/slash_command_plugin";

function make_state(
  overrides: Partial<SlashState> = {},
  cmds?: SlashCommand[],
): SlashState {
  const filtered = cmds ?? create_commands().slice(0, 3);
  return {
    active: true,
    query: "",
    from: 0,
    selected_index: 0,
    filtered,
    ...overrides,
  };
}

function setup(state: SlashState) {
  const { menu, live_region } = create_menu_el();
  const on_select = vi.fn();
  const on_click = vi.fn();
  render_items(menu, live_region, state, on_select, on_click, new Map());
  return { menu, live_region, on_select, on_click };
}

describe("slash menu ARIA attributes", () => {
  it("listbox has aria-activedescendant pointing to the selected option", () => {
    const { menu } = setup(make_state({ selected_index: 1 }));
    const list = menu.querySelector('[role="listbox"]');
    const active_id = list?.getAttribute("aria-activedescendant");
    expect(active_id).toBeTruthy();
    const active_el = menu.querySelector(`#${active_id}`);
    expect(active_el?.getAttribute("aria-selected")).toBe("true");
  });

  it("each option has a unique stable id and role=option", () => {
    const cmds = create_commands().slice(0, 4);
    const { menu } = setup(make_state({ filtered: cmds }));
    const options = menu.querySelectorAll('[role="option"]');
    expect(options.length).toBe(4);
    const ids = Array.from(options).map((o) => o.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("only the selected option has aria-selected=true", () => {
    const cmds = create_commands().slice(0, 3);
    const { menu } = setup(make_state({ selected_index: 2, filtered: cmds }));
    const options = menu.querySelectorAll('[role="option"]');
    const selected = Array.from(options).filter(
      (o) => o.getAttribute("aria-selected") === "true",
    );
    expect(selected.length).toBe(1);
    expect(selected[0]?.id).toBe(
      menu
        .querySelector('[role="listbox"]')
        ?.getAttribute("aria-activedescendant"),
    );
  });

  it("live region is present and announces the selected item label", () => {
    const cmds = create_commands().slice(0, 3);
    const state = make_state({ selected_index: 1, filtered: cmds });
    const { live_region } = setup(state);
    expect(live_region.getAttribute("aria-live")).toBe("polite");
    expect(live_region.getAttribute("aria-atomic")).toBe("true");
    expect(live_region.textContent).toBe(cmds[1]?.label);
  });

  it("live region announces 'No results' when filtered list is empty", () => {
    const { live_region } = setup(make_state({ filtered: [] }));
    expect(live_region.textContent).toBe("No results");
  });
});

describe("slash menu focus-steal prevention", () => {
  it("mousedown on a list item calls preventDefault", () => {
    const { menu } = setup(make_state());
    const item = menu.querySelector<HTMLButtonElement>('[role="option"]');
    expect(item).not.toBeNull();
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    item!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("mousedown on the preview pane calls preventDefault", () => {
    const { menu } = setup(make_state());
    const preview = menu.querySelector<HTMLElement>(".SlashMenu__preview");
    expect(preview).not.toBeNull();
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    preview!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("slash menu hover selection", () => {
  it("pointer movement onto an item calls on_select with that item's index", () => {
    const cmds = create_commands().slice(0, 3);
    const { menu, on_select } = setup(make_state({ filtered: cmds }));
    const options = menu.querySelectorAll<HTMLElement>('[role="option"]');
    options[2]?.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 11, clientY: 21 }),
    );
    expect(on_select).toHaveBeenCalledWith(2);
  });

  it("pointer movement onto first item calls on_select with index 0", () => {
    const cmds = create_commands().slice(0, 3);
    const { menu, on_select } = setup(
      make_state({ selected_index: 2, filtered: cmds }),
    );
    const options = menu.querySelectorAll<HTMLElement>('[role="option"]');
    options[0]?.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 12, clientY: 22 }),
    );
    expect(on_select).toHaveBeenCalledWith(0);
  });

  it("scroll-induced hover with unchanged coordinates does not change selection", () => {
    const cmds = create_commands().slice(0, 3);
    const { menu, on_select } = setup(make_state({ filtered: cmds }));
    const options = menu.querySelectorAll<HTMLElement>('[role="option"]');
    options[1]?.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 13, clientY: 23 }),
    );
    expect(on_select).toHaveBeenCalledWith(1);
    on_select.mockClear();
    options[2]?.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 13, clientY: 23 }),
    );
    expect(on_select).not.toHaveBeenCalled();
  });

  it("pointer movement within the already-selected item does not re-select", () => {
    const cmds = create_commands().slice(0, 3);
    const { menu, on_select } = setup(
      make_state({ selected_index: 1, filtered: cmds }),
    );
    const options = menu.querySelectorAll<HTMLElement>('[role="option"]');
    options[1]?.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 14, clientY: 24 }),
    );
    expect(on_select).not.toHaveBeenCalled();
  });
});

describe("slash menu re-render preserves scroll position", () => {
  it("keeps list scrollTop across re-render", () => {
    const cmds = create_commands().slice(0, 3);
    const { menu, live_region, on_select, on_click } = setup(
      make_state({ filtered: cmds }),
    );
    const list = menu.querySelector<HTMLElement>(".SlashMenu__list");
    expect(list).not.toBeNull();
    if (list) list.scrollTop = 42;

    const state2 = make_state({ selected_index: 2, filtered: cmds });
    render_items(menu, live_region, state2, on_select, on_click, new Map());

    const new_list = menu.querySelector<HTMLElement>(".SlashMenu__list");
    expect(new_list).not.toBe(list);
    expect(new_list?.scrollTop).toBe(42);
  });
});

describe("slash menu re-render preserves live region", () => {
  it("re-rendering updates aria-activedescendant without duplicating live region", () => {
    const cmds = create_commands().slice(0, 3);
    const { menu, live_region, on_select, on_click } = setup(
      make_state({ filtered: cmds }),
    );
    const state2 = make_state({ selected_index: 2, filtered: cmds });
    render_items(menu, live_region, state2, on_select, on_click, new Map());

    const live_regions = menu.querySelectorAll('[aria-live="polite"]');
    expect(live_regions.length).toBe(1);
    expect(live_region.textContent).toBe(cmds[2]?.label);
  });
});
