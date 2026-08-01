/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "../helpers/svelte_client_runtime";
import FolderSuggestInput from "$lib/components/ui/folder_suggest_input.svelte";
import PropertyCombobox from "$lib/features/metadata/ui/property_combobox.svelte";

type ScrollCall = { element: Element; options: unknown };

let scroll_calls: ScrollCall[] = [];
let original_scroll_into_view: typeof Element.prototype.scrollIntoView;
let mounted: Array<{ app: ReturnType<typeof mount>; target: HTMLElement }> = [];

function make_target(): HTMLElement {
  const target = document.createElement("div");
  document.body.appendChild(target);
  return target;
}

function track(app: ReturnType<typeof mount>, target: HTMLElement) {
  mounted.push({ app, target });
  flushSync();
  return target;
}

function press(input: HTMLInputElement, key: string) {
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  flushSync();
}

function input_of(target: HTMLElement): HTMLInputElement {
  const input = target.querySelector("input");
  if (!input) throw new Error("No input rendered");
  return input;
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

describe("folder_suggest_input keeps the selection in view", () => {
  it("scrolls the highlighted folder into view on arrow-down", () => {
    const target = make_target();
    track(
      mount(FolderSuggestInput, {
        target,
        props: {
          value: "",
          folder_paths: Array.from({ length: 12 }, (_, i) => `folder-${i}`),
          on_change: vi.fn(),
        },
      }),
      target,
    );
    const input = input_of(target);
    input.dispatchEvent(new FocusEvent("focus"));
    flushSync();
    scroll_calls = [];

    for (let i = 0; i < 5; i += 1) press(input, "ArrowDown");

    const { element, options } = last_scroll_call();
    expect(element).toBe(
      target.querySelector(".FolderSuggest__item--selected"),
    );
    expect(options).toEqual({ block: "nearest" });
  });
});

describe("property_combobox keeps the selection in view", () => {
  it("scrolls the highlighted value into view on arrow-down", () => {
    const target = make_target();
    track(
      mount(PropertyCombobox, {
        target,
        props: {
          value: "",
          items: Array.from({ length: 12 }, (_, i) => ({
            value: `value-${i}`,
          })),
          on_input: vi.fn(),
          on_select: vi.fn(),
        },
      }),
      target,
    );
    const input = input_of(target);
    input.dispatchEvent(new FocusEvent("focus"));
    flushSync();
    scroll_calls = [];

    for (let i = 0; i < 5; i += 1) press(input, "ArrowDown");

    const { element, options } = last_scroll_call();
    expect(element).toBe(
      target.querySelector(".PropertyCombobox__item--selected"),
    );
    expect(element?.textContent).toContain("value-4");
    expect(options).toEqual({ block: "nearest" });
  });
});
