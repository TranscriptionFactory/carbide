/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { SvelteMap } from "svelte/reactivity";

import AiInlineMenu from "$lib/features/editor/ui/ai_inline_menu.svelte";
import type { RunId, RunRecord } from "$lib/features/assistant";
import { make_run_record } from "../../../helpers/assistant_fixtures";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

function render_menu(
  overrides: {
    streaming?: boolean;
    runs?: RunRecord[];
    on_stop?: (id: RunId) => void;
  } = {},
) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(AiInlineMenu, {
    target,
    props: {
      mode: "cursor_command",
      streaming: overrides.streaming ?? false,
      commands: [],
      on_submit: vi.fn(),
      on_command: vi.fn(),
      on_retry: vi.fn(),
      on_accept: vi.fn(),
      on_reject: vi.fn(),
      on_close: vi.fn(),
      get_runs: () => overrides.runs ?? [],
      ...(overrides.on_stop ? { on_stop: overrides.on_stop } : {}),
    },
  });

  flushSync();

  return {
    cleanup() {
      void unmount(app);
      target.remove();
      flushSync();
    },
  };
}

function presence_chip(): HTMLElement {
  const chip = document.querySelector<HTMLElement>(
    '[data-testid="status-assistant-presence"]',
  );
  if (!chip) throw new Error("presence chip not rendered");
  return chip;
}

function stop_button(id: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    `[data-testid="assistant-stop-${id}"]`,
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ai_inline_menu.svelte — presence", () => {
  it("renders the presence chip from the get_runs getter", () => {
    const view = render_menu({
      runs: [make_run_record({ id: "run-1", provider_id: "claude" })],
    });

    expect(presence_chip().textContent).toContain("claude · 1 run");

    view.cleanup();
  });

  it("shows a calm ready chip when no getter is provided", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const app = mount(AiInlineMenu, {
      target,
      props: {
        mode: "cursor_command",
        streaming: false,
        commands: [],
        on_submit: vi.fn(),
        on_command: vi.fn(),
        on_retry: vi.fn(),
        on_accept: vi.fn(),
        on_reject: vi.fn(),
        on_close: vi.fn(),
      },
    });
    flushSync();

    expect(presence_chip().textContent).toContain("ready");

    void unmount(app);
    target.remove();
    flushSync();
  });

  it("stays live against the run store behind the getter", () => {
    const runs = new SvelteMap<RunId, RunRecord>();
    const target = document.createElement("div");
    document.body.appendChild(target);
    const app = mount(AiInlineMenu, {
      target,
      props: {
        mode: "cursor_command",
        streaming: false,
        commands: [],
        on_submit: vi.fn(),
        on_command: vi.fn(),
        on_retry: vi.fn(),
        on_accept: vi.fn(),
        on_reject: vi.fn(),
        on_close: vi.fn(),
        get_runs: () => [...runs.values()],
      },
    });
    flushSync();

    expect(presence_chip().textContent).toContain("ready");

    runs.set("run-1", make_run_record({ id: "run-1" }));
    flushSync();

    expect(presence_chip().textContent).toContain("claude · 1 run");

    void unmount(app);
    target.remove();
    flushSync();
  });
});

describe("ai_inline_menu.svelte — stop while streaming", () => {
  it("hides the stop button when not streaming, even with an active inline run", () => {
    const view = render_menu({
      streaming: false,
      runs: [make_run_record({ id: "run-1", kind: "inline" })],
      on_stop: vi.fn(),
    });

    expect(stop_button("run-1")).toBeNull();

    view.cleanup();
  });

  it("hides the stop button when no inline run is active", () => {
    const view = render_menu({
      streaming: true,
      runs: [make_run_record({ id: "run-1", kind: "chat" })],
      on_stop: vi.fn(),
    });

    expect(stop_button("run-1")).toBeNull();

    view.cleanup();
  });

  it("shows the stop button while streaming an inline run", () => {
    const view = render_menu({
      streaming: true,
      runs: [make_run_record({ id: "run-1", kind: "inline" })],
      on_stop: vi.fn(),
    });

    expect(stop_button("run-1")).toBeInstanceOf(HTMLButtonElement);

    view.cleanup();
  });

  it("targets the newest active inline run, never another kind", () => {
    const on_stop = vi.fn();
    const view = render_menu({
      streaming: true,
      runs: [
        make_run_record({ id: "old-inline", kind: "inline", started_at: 1 }),
        make_run_record({ id: "new-chat", kind: "chat", started_at: 3 }),
        make_run_record({ id: "new-inline", kind: "inline", started_at: 2 }),
      ],
      on_stop,
    });

    const newest = stop_button("new-inline");
    expect(newest).toBeInstanceOf(HTMLButtonElement);
    expect(stop_button("old-inline")).toBeNull();
    expect(stop_button("new-chat")).toBeNull();

    newest?.click();
    expect(on_stop).toHaveBeenCalledWith("new-inline");

    view.cleanup();
  });
});
