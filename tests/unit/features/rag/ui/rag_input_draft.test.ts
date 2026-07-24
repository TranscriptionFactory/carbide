/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import RagInputFixture from "./rag_input_fixture.svelte";
import { RagStore } from "$lib/features/rag";

type Mounted = { app: ReturnType<typeof mount>; target: HTMLElement };
let mounted: Mounted[] = [];

function render(store: RagStore, on_submit = vi.fn()) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(RagInputFixture, { target, props: { store, on_submit } });
  mounted.push({ app, target });
  flushSync();
  return { target, on_submit };
}

function textarea_of(target: HTMLElement): HTMLTextAreaElement {
  const el = target.querySelector("textarea");
  if (!el) throw new Error("textarea not found");
  return el;
}

function submit_button(target: HTMLElement): HTMLButtonElement {
  const button = [...target.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Ask"),
  );
  if (!button) throw new Error("submit button not found");
  return button;
}

function press_enter(
  ta: HTMLTextAreaElement,
  mods: { altKey?: boolean } = {},
): void {
  ta.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      altKey: mods.altKey ?? false,
    }),
  );
  flushSync();
}

afterEach(() => {
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
});

describe("RagInput draft binding", () => {
  it("shows the store draft and preserves it across unmount/remount", () => {
    const store = new RagStore();
    store.draft = "unsent thoughts";

    const first = render(store);
    expect(textarea_of(first.target).value).toBe("unsent thoughts");

    const previous = mounted.pop();
    if (previous) {
      void unmount(previous.app);
      previous.target.remove();
    }
    expect(store.draft).toBe("unsent thoughts");

    const second = render(store);
    expect(textarea_of(second.target).value).toBe("unsent thoughts");
  });

  it("clears the store draft on submit", () => {
    const store = new RagStore();
    store.draft = "hello world";
    const { target, on_submit } = render(store);

    submit_button(target).click();
    flushSync();

    expect(on_submit).toHaveBeenCalledWith("hello world");
    expect(store.draft).toBe("");
    expect(textarea_of(target).value).toBe("");
  });

  it("submits on plain Enter but not on Alt+Enter", () => {
    const store = new RagStore();
    store.draft = "draft text";
    const { target, on_submit } = render(store);
    const ta = textarea_of(target);

    press_enter(ta, { altKey: true });
    expect(on_submit).not.toHaveBeenCalled();

    press_enter(ta);
    expect(on_submit).toHaveBeenCalledWith("draft text");
  });
});
