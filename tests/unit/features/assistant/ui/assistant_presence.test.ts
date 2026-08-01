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
) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(AssistantPresence, {
    target,
    props: { runs, on_stop, now: () => 0 },
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
    expect(cell.textContent).toContain("ready");
    expect(cell.textContent).not.toMatch(/\d/);
    expect(cell.querySelector(".AssistantPresence__dot--streaming")).toBeNull();
    expect(cell.querySelector(".AssistantPresence__dot--error")).toBeNull();

    view.cleanup();
  });

  it("shows the active run count with a streaming dot", () => {
    const view = render_presence([
      make_run_record({ id: "a", status: "streaming" }),
      make_run_record({ id: "b", status: "starting" }),
      make_run_record({ id: "c", status: "streaming" }),
    ]);

    const cell = get_cell();
    expect(cell.textContent).toContain("3 runs");
    expect(
      cell.querySelector(".AssistantPresence__dot--streaming"),
    ).toBeInstanceOf(HTMLElement);

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

  it("uses a singular label for exactly one active run", () => {
    const one = render_presence([
      make_run_record({ id: "a", status: "streaming" }),
    ]);
    expect(get_cell().textContent).toContain("1 run");
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
