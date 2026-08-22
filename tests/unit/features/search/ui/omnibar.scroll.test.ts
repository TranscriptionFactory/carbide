/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "svelte";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import { create_replaceable_props } from "../../../helpers/reactive_props.svelte";
import { create_test_note } from "../../../helpers/test_fixtures";

vi.mock(
  "$lib/components/ui/dialog/index.js",
  async () => import("../../../helpers/ui_stubs/dialog"),
);

import Omnibar from "$lib/features/search/ui/omnibar.svelte";
import type { OmnibarItem } from "$lib/shared/types/search";

type OmnibarProps = ComponentProps<typeof Omnibar>;

type ScrollCall = { element: Element; options: unknown };

let scroll_calls: ScrollCall[] = [];
let original_scroll_into_view: typeof Element.prototype.scrollIntoView;
let mounted: Array<{ app: ReturnType<typeof mount>; target: HTMLElement }> = [];

function note_items(count: number): OmnibarItem[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: "note" as const,
    note: create_test_note(`note-${index}`, `Note ${index}`),
    score: 1,
  }));
}

function render_omnibar(overrides: Partial<OmnibarProps>) {
  const { props, replace } = create_replaceable_props<OmnibarProps>({
    open: true,
    query: "",
    selected_index: 0,
    is_searching: false,
    scope: "current_vault",
    file_type_filters: [],
    kind_filters: [],
    sort_mode: "relevance",
    sort_ascending: true,
    items: [],
    recent_notes: [],
    recent_command_ids: [],
    hotkeys_config: { bindings: [] },
    has_multiple_vaults: false,
    plugin_commands: [],
    on_open_change: vi.fn(),
    on_query_change: vi.fn(),
    on_selected_index_change: vi.fn(),
    on_scope_change: vi.fn(),
    on_toggle_file_type_filter: vi.fn(),
    on_toggle_kind_filter: vi.fn(),
    on_sort_mode_change: vi.fn(),
    on_toggle_sort_order: vi.fn(),
    on_clear_filters: vi.fn(),
    on_confirm: vi.fn(),
    on_view_as_graph: vi.fn(),
    ...overrides,
  });
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(Omnibar, { target, props });
  mounted.push({ app, target });
  flushSync();
  return { target, replace };
}

function selected_item(target: HTMLElement): Element {
  const item = target.querySelector(".Omnibar__item--selected");
  if (!item) throw new Error("No selected omnibar item rendered");
  return item;
}

function last_scroll_call(): ScrollCall {
  const call = scroll_calls.at(-1);
  if (!call) throw new Error("scrollIntoView was never called");
  return call;
}

beforeEach(() => {
  scroll_calls = [];
  original_scroll_into_view = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (
    this: Element,
    options?: boolean | ScrollIntoViewOptions,
  ) {
    scroll_calls.push({ element: this, options });
  };
});

afterEach(() => {
  Element.prototype.scrollIntoView = original_scroll_into_view;
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
  document.body.innerHTML = "";
});

describe("omnibar keeps the selection in view", () => {
  it("scrolls the newly selected result into view in list mode", () => {
    const { target, replace } = render_omnibar({
      query: "note",
      items: note_items(20),
    });
    scroll_calls = [];

    replace({ selected_index: 12 });
    flushSync();

    const { element, options } = last_scroll_call();
    expect(element).toBe(selected_item(target));
    expect(element.textContent).toContain("Note 12");
    expect(options).toEqual({ block: "nearest" });
  });

  it("scrolls the newly selected command into view in command mode", () => {
    const { target, replace } = render_omnibar({ query: ">" });
    const commands = target.querySelectorAll(".Omnibar__item");
    expect(commands.length).toBeGreaterThan(5);
    scroll_calls = [];

    replace({ selected_index: 5 });
    flushSync();

    const { element, options } = last_scroll_call();
    expect(element).toBe(selected_item(target));
    expect(element).toBe(commands[5]);
    expect(options).toEqual({ block: "nearest" });
  });

  it("scrolls again on every selection step", () => {
    const { target, replace } = render_omnibar({
      query: "note",
      items: note_items(20),
    });
    scroll_calls = [];

    for (const index of [1, 2, 3]) {
      replace({ selected_index: index });
      flushSync();
      expect(last_scroll_call().element).toBe(selected_item(target));
    }
    expect(scroll_calls).toHaveLength(3);
  });
});

describe("omnibar empty-query sorting", () => {
  it("applies name direction to recent notes without a query", () => {
    const recent_notes = [
      create_test_note("alpha.md", "Alpha"),
      create_test_note("beta.md", "Beta"),
    ];
    const { target } = render_omnibar({
      recent_notes,
      sort_mode: "name",
      sort_ascending: false,
      kind_filters: ["notes"],
    });

    const titles = [...target.querySelectorAll(".Omnibar__item-title")].map(
      (element) => element.textContent,
    );
    expect(titles).toEqual(["beta.md", "alpha.md"]);
  });
});

describe("omnibar sort direction control", () => {
  it("shows the direction toggle only for sortable modes", () => {
    const on_toggle_sort_order = vi.fn();
    const { target, replace } = render_omnibar({
      sort_mode: "name",
      on_toggle_sort_order,
    });
    target
      .querySelector("input")
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
    flushSync();

    const toggle = target.querySelector<HTMLButtonElement>(
      '[aria-label="Sort descending"]',
    );
    expect(toggle).not.toBeNull();
    toggle?.click();
    expect(on_toggle_sort_order).toHaveBeenCalledOnce();

    replace({ sort_mode: "relevance" });
    flushSync();
    expect(target.querySelector('[aria-label="Sort descending"]')).toBeNull();
  });
});
