/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { contain_focus } from "$lib/components/ui/contain_focus";

type Rendered = {
  outside: HTMLButtonElement;
  node: HTMLDivElement;
  first: HTMLButtonElement;
  middle: HTMLInputElement;
  last: HTMLButtonElement;
  destroy: () => void;
};

function setup(): Rendered {
  const outside = document.createElement("button");
  document.body.appendChild(outside);
  outside.focus();

  const node = document.createElement("div");
  const first = document.createElement("button");
  const middle = document.createElement("input");
  const last = document.createElement("button");
  node.append(first, middle, last);
  document.body.appendChild(node);

  const action = contain_focus(node) as { destroy: () => void };
  return {
    outside,
    node,
    first,
    middle,
    last,
    destroy: () => action.destroy(),
  };
}

function press_tab(node: HTMLElement, shift = false) {
  node.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    }),
  );
}

async function microtasks() {
  await Promise.resolve();
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("contain_focus keyboard containment", () => {
  it("focuses the first focusable on mount when focus is outside", async () => {
    const { first, destroy } = setup();
    await microtasks();
    expect(document.activeElement).toBe(first);
    destroy();
  });

  it("wraps Tab from the last focusable to the first", async () => {
    const { first, last, destroy } = setup();
    await microtasks();
    last.focus();
    press_tab(last);
    expect(document.activeElement).toBe(first);
    destroy();
  });

  it("wraps Shift+Tab from the first focusable to the last", async () => {
    const { first, last, destroy } = setup();
    await microtasks();
    first.focus();
    press_tab(first, true);
    expect(document.activeElement).toBe(last);
    destroy();
  });

  it("leaves interior Tab moves alone", async () => {
    const { middle, destroy } = setup();
    await microtasks();
    middle.focus();
    press_tab(middle);
    expect(document.activeElement).toBe(middle);
    destroy();
  });

  it("restores focus to the previously-focused element on destroy", async () => {
    const { outside, destroy } = setup();
    await microtasks();
    destroy();
    expect(document.activeElement).toBe(outside);
  });
});
