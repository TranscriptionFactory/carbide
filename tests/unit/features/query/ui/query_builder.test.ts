/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import QueryBuilder from "$lib/features/query/ui/query_builder.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import { flushSync } from "../../../helpers/svelte_client_runtime";

function render_query_builder() {
  const on_insert = vi.fn();
  const rendered = render_with_app_context(QueryBuilder, {
    app_context: {
      stores: create_app_stores(),
    } as unknown as Partial<AppContext>,
    props: { on_insert },
  });
  return { on_insert, ...rendered };
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

afterEach(() => {
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
