/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatInput from "$lib/features/assistant/ui/chat_input.svelte";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import { create_replaceable_props } from "../../../helpers/reactive_props.svelte";

type ChatInputProps = Record<string, unknown>;

function render_chat_input(overrides: ChatInputProps = {}) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const initial: ChatInputProps = {
    providers: [{ id: "claude", name: "Claude" }],
    provider_id: "claude",
    scope: {},
    folder_paths: [],
    tags: [],
    saved_views: [],
    active_note_path: null,
    is_loading: false,
    is_streaming: false,
    readiness_state: "ready",
    mode: "agent",
    suggest_notes: vi.fn().mockResolvedValue([]),
    on_submit: vi.fn(),
    on_stop: vi.fn(),
    on_provider_change: vi.fn(),
    on_scope_change: vi.fn(),
    restore_text: null,
    on_restore_consumed: () => {},
    ...overrides,
  };

  const { props, replace } = create_replaceable_props(initial);
  const app = mount(ChatInput, { target, props: props as never });
  flushSync();

  return {
    props: initial,
    replace,
    cleanup() {
      void unmount(app);
      target.remove();
      flushSync();
    },
  };
}

function textarea(): HTMLTextAreaElement {
  const el = document.body.querySelector("textarea");
  if (!(el instanceof HTMLTextAreaElement)) throw new Error("no composer");
  return el;
}

function type(text: string) {
  const el = textarea();
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function press_enter() {
  textarea().dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  flushSync();
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("chat_input.svelte", () => {
  it("submits while a turn is streaming instead of swallowing the keystroke", () => {
    const view = render_chat_input({ is_streaming: true });

    type("queued while streaming");
    press_enter();

    expect(view.props.on_submit).toHaveBeenCalledWith("queued while streaming");
    expect(textarea().value).toBe("");

    view.cleanup();
  });

  it("takes a restored prompt back as editable text and reports it consumed", () => {
    const on_restore_consumed = vi.fn();
    const view = render_chat_input({
      restore_text: "the stopped prompt",
      on_restore_consumed,
    });

    expect(textarea().value).toBe("the stopped prompt");
    expect(on_restore_consumed).toHaveBeenCalledTimes(1);

    view.cleanup();
  });

  it("keeps text the user typed after queueing when a prompt comes back", () => {
    const view = render_chat_input();

    type("typed since");
    view.replace({ restore_text: "the stopped prompt" });
    flushSync();

    expect(textarea().value).toBe("the stopped prompt\ntyped since");

    view.cleanup();
  });

  it("grows the composer to fit its content and caps it with a max height", () => {
    const view = render_chat_input();
    const el = textarea();
    Object.defineProperty(el, "scrollHeight", {
      configurable: true,
      value: 140,
    });

    type("line\nline\nline\nline");

    expect(el.style.height).toBe("140px");
    expect(el.className).toContain("max-h-48");
    // D1 declined a drag handle, so auto-grow is the only sizing control.
    expect(el.className).toContain("resize-none");

    view.cleanup();
  });
});
