/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import QueryBuilder from "$lib/features/query/ui/query_builder.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import { flushSync } from "../../../helpers/svelte_client_runtime";

function render_query_builder(
  options: {
    available_properties?: {
      name: string;
      property_type?: string;
      unique_values?: string[] | null;
    }[];
  } = {},
) {
  const stores = create_app_stores();
  stores.bases.available_properties = (options.available_properties ?? []).map(
    (p) => ({
      name: p.name,
      property_type: p.property_type ?? "string",
      count: 1,
      unique_values: p.unique_values ?? null,
    }),
  );
  const on_insert = vi.fn();
  const rendered = render_with_app_context(QueryBuilder, {
    app_context: {
      stores,
    } as unknown as Partial<AppContext>,
    props: { on_insert },
  });
  return { on_insert, stores, ...rendered };
}

function require_element<T extends Element>(
  target: Element,
  selector: string,
): T {
  const el = target.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function toggle_not(target: Element) {
  require_element<HTMLInputElement>(
    target,
    ".QueryBuilder__negate input",
  ).click();
  flushSync();
}

function select_kind(target: Element, kind: string) {
  const select = require_element<HTMLSelectElement>(
    target,
    ".QueryBuilder__row select",
  );
  select.value = kind;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  flushSync();
}

function fill_text(target: Element, value: string) {
  const input = require_element<HTMLInputElement>(target, 'input[type="text"]');
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function insert(target: Element) {
  require_element<HTMLButtonElement>(target, ".QueryBuilder__insert").click();
  flushSync();
}

function input_by_placeholder(
  target: Element,
  placeholder: string,
): HTMLInputElement {
  const input = target.querySelector<HTMLInputElement>(
    `input[placeholder="${placeholder}"]`,
  );
  if (!input) throw new Error(`missing input "${placeholder}"`);
  return input;
}

function type_into(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function focus_input(input: HTMLInputElement) {
  input.dispatchEvent(new FocusEvent("focus"));
  flushSync();
}

function combobox_root(target: Element, placeholder: string): HTMLElement {
  const root = input_by_placeholder(target, placeholder).closest<HTMLElement>(
    ".PropertyCombobox",
  );
  if (!root) throw new Error(`missing combobox "${placeholder}"`);
  return root;
}

function combobox_items(target: Element, placeholder: string): string[] {
  return [
    ...combobox_root(target, placeholder).querySelectorAll(
      ".PropertyCombobox__item-value",
    ),
  ].map((el) => el.textContent ?? "");
}

function select_combobox_item(
  target: Element,
  placeholder: string,
  value: string,
) {
  const item = [
    ...combobox_root(target, placeholder).querySelectorAll<HTMLElement>(
      ".PropertyCombobox__item",
    ),
  ].find(
    (el) =>
      el.querySelector(".PropertyCombobox__item-value")?.textContent === value,
  );
  if (!item) throw new Error(`missing combobox item "${value}"`);
  item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  document.body.innerHTML = "";
});

describe("query_builder clause kind changes", () => {
  it("keeps the not checkbox checked after changing the clause kind", () => {
    const { target, cleanup } = render_query_builder();

    toggle_not(target);
    select_kind(target, "linked_from");

    expect(
      require_element<HTMLInputElement>(target, ".QueryBuilder__negate input")
        .checked,
    ).toBe(true);

    cleanup();
  });

  it("emits the negation in the query text after a kind change", () => {
    const { target, on_insert, cleanup } = render_query_builder();

    toggle_not(target);
    select_kind(target, "linked_from");
    fill_text(target, "Index");
    insert(target);

    expect(on_insert).toHaveBeenCalledWith('notes not linked from "Index"');

    cleanup();
  });

  it("emits no negation when the clause was never negated", () => {
    const { target, on_insert, cleanup } = render_query_builder();

    select_kind(target, "linked_from");
    fill_text(target, "Index");
    insert(target);

    expect(on_insert).toHaveBeenCalledWith('notes linked from "Index"');

    cleanup();
  });

  it("no longer offers a form selector", () => {
    const { target, cleanup } = render_query_builder();

    expect(target.querySelector(".QueryBuilder__form")).toBeNull();

    cleanup();
  });
});

describe("query_builder property clause", () => {
  it("filters frontmatter properties as you type in the property field", () => {
    const view = render_query_builder({
      available_properties: [{ name: "priority" }, { name: "status" }],
    });
    const target = view.target;

    select_kind(target, "property");
    const input = input_by_placeholder(target, "property");
    focus_input(input);

    expect(combobox_items(target, "property")).toEqual(["priority", "status"]);

    type_into(input, "pri");

    expect(combobox_items(target, "property")).toEqual(["priority"]);

    view.cleanup();
  });

  it("emits an unknown property name typed as free text", () => {
    const view = render_query_builder({
      available_properties: [{ name: "priority" }],
    });
    const target = view.target;

    select_kind(target, "property");
    const input = input_by_placeholder(target, "property");
    focus_input(input);
    type_into(input, "wat");

    expect(combobox_items(target, "property")).toEqual([]);

    type_into(input_by_placeholder(target, "value"), "new");
    insert(target);

    expect(view.on_insert).toHaveBeenCalledWith('notes with wat = "new"');

    view.cleanup();
  });

  it("offers the chosen property's known values in the value field", () => {
    const view = render_query_builder({
      available_properties: [
        { name: "status", unique_values: ["todo", "done"] },
      ],
    });
    const target = view.target;

    select_kind(target, "property");
    const input = input_by_placeholder(target, "property");
    focus_input(input);
    type_into(input, "status");
    select_combobox_item(target, "property", "status");

    const value_input = input_by_placeholder(target, "value");
    focus_input(value_input);

    expect(combobox_items(target, "value")).toEqual(["todo", "done"]);

    type_into(value_input, "don");

    expect(combobox_items(target, "value")).toEqual(["done"]);

    select_combobox_item(target, "value", "done");
    insert(target);

    expect(view.on_insert).toHaveBeenCalledWith('notes with status = "done"');

    view.cleanup();
  });

  it("keeps the value field free text when the property has no values", () => {
    const view = render_query_builder({
      available_properties: [{ name: "priority", unique_values: null }],
    });
    const target = view.target;

    select_kind(target, "property");
    const input = input_by_placeholder(target, "property");
    focus_input(input);
    type_into(input, "priority");
    select_combobox_item(target, "property", "priority");

    const value_input = input_by_placeholder(target, "value");
    focus_input(value_input);

    expect(combobox_items(target, "value")).toEqual([]);

    type_into(value_input, "3");
    insert(target);

    expect(view.on_insert).toHaveBeenCalledWith('notes with priority = "3"');

    view.cleanup();
  });
});
