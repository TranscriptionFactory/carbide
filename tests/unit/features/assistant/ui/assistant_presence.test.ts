/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/components/ui/popover",
  async () => import("../../../helpers/ui_stubs/popover"),
);

import AssistantPresence from "$lib/features/assistant/ui/assistant_presence.svelte";
import type { RunId, RunRecord } from "$lib/features/assistant";
import { make_run_record } from "../../../helpers/assistant_fixtures";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

function render_presence(
  runs: RunRecord[],
  on_stop: (id: RunId) => void = vi.fn(),
  on_open_session?: (session_id: string) => void,
) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(AssistantPresence, {
    target,
    props: { runs, on_stop, now: () => 0, on_open_session },
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

function get_cell(): HTMLButtonElement {
  const element = document.body.querySelector(
    '[data-testid="status-assistant-presence"]',
  );
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error("presence cell not rendered");
  }
  return element;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("assistant_presence.svelte", () => {
  it("collapses to a calm ready state when there are no runs", () => {
    const view = render_presence([]);

    const cell = get_cell();
    expect(cell.textContent).toContain("Ready");
    expect(cell.textContent).not.toMatch(/\d/);
    expect(cell.querySelector(".AssistantPresence__dot--streaming")).toBeNull();
    expect(cell.querySelector(".AssistantPresence__dot--error")).toBeNull();

    view.cleanup();
  });

  it("prefixes the active count with the newest active run's provider", () => {
    const view = render_presence([
      make_run_record({ id: "a", status: "streaming" }),
      make_run_record({ id: "b", status: "starting" }),
      make_run_record({ id: "c", status: "streaming" }),
    ]);

    const cell = get_cell();
    expect(cell.textContent).toContain("claude · 3 runs");
    expect(
      cell.querySelector(".AssistantPresence__dot--streaming"),
    ).toBeInstanceOf(HTMLElement);

    view.cleanup();
  });

  it("reads the provider from the newest active run, not the oldest", () => {
    const view = render_presence([
      make_run_record({ id: "a", status: "streaming", started_at: 1 }),
      make_run_record({
        id: "b",
        status: "streaming",
        started_at: 2,
        provider_id: "gemini",
      }),
    ]);

    expect(get_cell().textContent).toContain("gemini · 2 runs");

    view.cleanup();
  });

  it("falls back to a bare count while the provider is unresolved", () => {
    const view = render_presence([
      make_run_record({ id: "a", status: "starting", provider_id: null }),
    ]);

    const cell = get_cell();
    expect(cell.textContent).toContain("1 run");
    expect(cell.textContent).not.toContain("·");

    view.cleanup();
  });

  it("keeps errors ahead of any provider prefix", () => {
    const view = render_presence([
      make_run_record({ id: "a", status: "streaming" }),
      make_run_record({
        id: "b",
        status: "error",
        error: { message: "boom", detail: "boom" },
      }),
    ]);

    const cell = get_cell();
    expect(cell.textContent).toContain("1 error");
    expect(cell.textContent).not.toContain("·");

    view.cleanup();
  });

  it("surfaces an errored run with error styling and a reachable message", () => {
    const view = render_presence([
      make_run_record({
        id: "a",
        status: "error",
        error: {
          message: "Claude Code is not installed.",
          detail: "spawn claude ENOENT",
        },
      }),
    ]);

    const cell = get_cell();
    expect(cell.classList.contains("AssistantPresence--error")).toBe(true);
    expect(cell.querySelector(".AssistantPresence__dot--error")).toBeInstanceOf(
      HTMLElement,
    );
    expect(cell.getAttribute("aria-label")).toContain(
      "Claude Code is not installed.",
    );
    expect(cell.getAttribute("title")).toContain(
      "Claude Code is not installed.",
    );

    view.cleanup();
  });

  it("excludes cleanly terminated runs from the active total", () => {
    const view = render_presence([
      make_run_record({ id: "a", status: "streaming" }),
      make_run_record({ id: "b", status: "streaming" }),
      make_run_record({ id: "c", status: "done" }),
      make_run_record({ id: "d", status: "done" }),
      make_run_record({ id: "e", status: "aborted" }),
    ]);

    expect(get_cell().textContent).toContain("2 runs");

    view.cleanup();
  });

  // The presence widget is a pass-through: the popover owns the affordance and
  // this component only has to hand the handler down. Without this the row's
  // open button is unreachable from every surface that mounts the widget.
  it("hands the open handler down to the run rows", () => {
    const on_open_session = vi.fn();
    const view = render_presence(
      [
        make_run_record({
          id: "inline-run",
          status: "streaming",
          origin: { session_id: "session-9" },
        }),
      ],
      vi.fn(),
      on_open_session,
    );

    document.body
      .querySelector<HTMLButtonElement>('[data-testid="assistant-run-open"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();

    expect(on_open_session.mock.calls).toEqual([["session-9"]]);

    view.cleanup();
  });

  it("shows no open affordance when no handler is passed down", () => {
    const view = render_presence([
      make_run_record({
        id: "inline-run",
        status: "streaming",
        origin: { session_id: "session-9" },
      }),
    ]);

    expect(
      document.body.querySelector('[data-testid="assistant-run-open"]'),
    ).toBeNull();

    view.cleanup();
  });

  it("uses a singular label for exactly one active run", () => {
    const one = render_presence([
      make_run_record({ id: "a", status: "streaming" }),
    ]);
    expect(get_cell().textContent).toContain("claude · 1 run");
    expect(get_cell().textContent).not.toContain("1 runs");
    one.cleanup();

    const two = render_presence([
      make_run_record({ id: "a", status: "streaming" }),
      make_run_record({ id: "b", status: "streaming" }),
    ]);
    expect(get_cell().textContent).toContain("2 runs");
    two.cleanup();
  });
});
