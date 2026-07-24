/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import AiInlineMenu from "$lib/features/editor/ui/ai_inline_menu.svelte";

type Mounted = { app: ReturnType<typeof mount>; target: HTMLElement };
let mounted: Mounted[] = [];

function render(on_submit = vi.fn()) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(AiInlineMenu, {
    target,
    props: {
      mode: "cursor_command",
      streaming: false,
      commands: [],
      on_submit,
      on_command: vi.fn(),
      on_retry: vi.fn(),
      on_accept: vi.fn(),
      on_reject: vi.fn(),
      on_close: vi.fn(),
    },
  });
  mounted.push({ app, target });
  flushSync();
  return { target, on_submit };
}

function type_prompt(ta: HTMLTextAreaElement, text: string): void {
  ta.value = text;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function press_enter(
  ta: HTMLTextAreaElement,
  mods: {
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    isComposing?: boolean;
  } = {},
): void {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    altKey: mods.altKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
  });
  if (mods.isComposing) {
    Object.defineProperty(event, "isComposing", { value: true });
  }
  ta.dispatchEvent(event);
  flushSync();
}

afterEach(() => {
  for (const { app, target } of mounted) {
    void unmount(app);
    target.remove();
  }
  mounted = [];
});

describe("AiInlineMenu prompt submit", () => {
  it("ignores Enter combined with a modifier or IME composition", () => {
    const { target, on_submit } = render();
    const ta = target.querySelector("textarea");
    if (!ta) throw new Error("textarea not found");
    type_prompt(ta, "write a poem");

    press_enter(ta, { altKey: true });
    press_enter(ta, { ctrlKey: true });
    press_enter(ta, { metaKey: true });
    press_enter(ta, { isComposing: true });

    expect(on_submit).not.toHaveBeenCalled();
  });

  it("submits on a plain Enter", () => {
    const { target, on_submit } = render();
    const ta = target.querySelector("textarea");
    if (!ta) throw new Error("textarea not found");
    type_prompt(ta, "write a poem");

    press_enter(ta);

    expect(on_submit).toHaveBeenCalledWith("write a poem");
  });
});
