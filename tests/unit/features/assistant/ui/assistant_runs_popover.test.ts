/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import AssistantRunsPopover from "$lib/features/assistant/ui/assistant_runs_popover.svelte";
import type { RunId, RunRecord } from "$lib/features/assistant";
import {
  create_mock_kernel,
  make_run_record,
} from "../../../helpers/assistant_fixtures";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";

const NOW_MS = 100_000;

function render_popover(options: {
  runs: RunRecord[];
  on_stop?: (id: RunId) => void;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);

  const app = mount(AssistantRunsPopover, {
    target,
    props: {
      runs: options.runs,
      on_stop: options.on_stop ?? vi.fn(),
      now: () => NOW_MS,
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

function get_rows(): HTMLElement[] {
  return [
    ...document.body.querySelectorAll<HTMLElement>(
      '[data-testid="assistant-run-row"]',
    ),
  ];
}

function get_row(run_id: string): HTMLElement {
  const row = document.body.querySelector<HTMLElement>(
    `[data-testid="assistant-run-row"][data-run-id="${run_id}"]`,
  );
  if (!row) throw new Error(`no row for run ${run_id}`);
  return row;
}

function text_of(row: HTMLElement, testid: string): string {
  return row.querySelector(`[data-testid="${testid}"]`)?.textContent ?? "";
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("assistant_runs_popover.svelte", () => {
  it("lists one row per live run in start order", () => {
    const view = render_popover({
      runs: [
        make_run_record({ id: "third", started_at: 30_000 }),
        make_run_record({ id: "first", started_at: 10_000 }),
        make_run_record({ id: "second", started_at: 20_000 }),
      ],
    });

    expect(get_rows().map((row) => row.dataset.runId)).toEqual([
      "first",
      "second",
      "third",
    ]);

    view.cleanup();
  });

  it("shows kind glyph, label and elapsed time derived from started_at", () => {
    const view = render_popover({
      runs: [
        make_run_record({
          id: "chat-run",
          kind: "chat",
          label: "Ranking experiments",
          started_at: NOW_MS - 42_000,
        }),
        make_run_record({
          id: "note-run",
          kind: "note",
          label: "Summarize",
          started_at: NOW_MS - 62_000,
          origin: { note_path: "notes/hybrid-retrieval.md" },
        }),
        make_run_record({
          id: "inline-run",
          kind: "inline",
          label: "Tighten prose",
          started_at: NOW_MS - 7_000,
        }),
      ],
    });

    const chat_row = get_row("chat-run");
    expect(chat_row.dataset.kind).toBe("chat");
    expect(chat_row.querySelector(".AssistantRuns__kind")?.textContent).toBe(
      "◈",
    );
    expect(chat_row.textContent).toContain("Ranking experiments");
    expect(text_of(chat_row, "assistant-run-elapsed")).toBe("00:42");

    const note_row = get_row("note-run");
    expect(note_row.querySelector(".AssistantRuns__kind")?.textContent).toBe(
      "▤",
    );
    expect(note_row.textContent).toContain("Summarize · hybrid-retrieval");
    expect(text_of(note_row, "assistant-run-elapsed")).toBe("01:02");

    const inline_row = get_row("inline-run");
    expect(inline_row.querySelector(".AssistantRuns__kind")?.textContent).toBe(
      "⌁",
    );
    expect(text_of(inline_row, "assistant-run-elapsed")).toBe("00:07");

    view.cleanup();
  });

  it("treats an inline run as an ordinary row, with no special casing", () => {
    const kernel = create_mock_kernel();
    const view = render_popover({
      runs: [
        make_run_record({
          id: "inline-run",
          kind: "inline",
          label: "Tighten prose",
          status: "streaming",
          started_at: NOW_MS - 7_000,
        }),
        make_run_record({
          id: "chat-run",
          kind: "chat",
          label: "Ranking experiments",
          status: "streaming",
          started_at: NOW_MS - 7_000,
        }),
      ],
      on_stop: (id) => {
        kernel.stop(id);
      },
    });

    const inline_row = get_row("inline-run");
    const chat_row = get_row("chat-run");

    expect(text_of(inline_row, "assistant-run-sub")).toBe("streaming · inline");
    expect(text_of(chat_row, "assistant-run-sub")).toBe("streaming · chat");
    expect(text_of(inline_row, "assistant-run-elapsed")).toBe(
      text_of(chat_row, "assistant-run-elapsed"),
    );

    const stop = inline_row.querySelector<HTMLButtonElement>(
      '[data-testid="assistant-stop-inline-run"]',
    );
    expect(stop?.disabled).toBe(false);

    stop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();

    expect(kernel._stopped).toEqual(["inline-run"]);

    view.cleanup();
  });

  it("stops exactly the clicked run through the kernel", () => {
    const kernel = create_mock_kernel();
    const view = render_popover({
      runs: [
        make_run_record({ id: "keep", started_at: 10_000 }),
        make_run_record({ id: "target", started_at: 20_000 }),
      ],
      on_stop: (id) => {
        kernel.stop(id);
      },
    });

    const stop = get_row("target").querySelector<HTMLButtonElement>(
      '[data-testid="assistant-stop-target"]',
    );
    stop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();

    expect(kernel._stopped).toEqual(["target"]);

    view.cleanup();
  });

  it("leaves the other rows mounted after one is stopped", () => {
    const kernel = create_mock_kernel();
    const view = render_popover({
      runs: [
        make_run_record({ id: "keep-a", started_at: 10_000 }),
        make_run_record({ id: "target", started_at: 20_000 }),
        make_run_record({ id: "keep-b", started_at: 30_000 }),
      ],
      on_stop: (id) => {
        kernel.stop(id);
      },
    });

    get_row("target")
      .querySelector<HTMLButtonElement>('[data-testid="assistant-stop-target"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();

    expect(kernel._stopped).toEqual(["target"]);
    expect(get_rows().map((row) => row.dataset.runId)).toEqual([
      "keep-a",
      "target",
      "keep-b",
    ]);

    view.cleanup();
  });

  it("renders the empty state when every run has terminated", () => {
    const view = render_popover({
      runs: [
        make_run_record({ id: "a", status: "done" }),
        make_run_record({ id: "b", status: "aborted" }),
      ],
    });

    expect(get_rows()).toHaveLength(0);
    expect(
      document.body.querySelector('[data-testid="assistant-runs-empty"]')
        ?.textContent,
    ).toContain("No active runs");

    view.cleanup();
  });

  it("shows the humanized error message rather than the raw provider text", () => {
    const view = render_popover({
      runs: [
        make_run_record({
          id: "failed",
          status: "error",
          error: {
            message: "Claude Code is not installed.",
            detail:
              "Error: spawn claude ENOENT\n    at ChildProcess._handle.onexit (node:internal/child_process:285:19)\n    at onErrorNT (node:internal/child_process:483:16)",
          },
        }),
      ],
    });

    const row = get_row("failed");
    expect(text_of(row, "assistant-run-sub")).toBe(
      "Claude Code is not installed.",
    );
    expect(row.textContent).not.toContain("ENOENT");
    expect(row.textContent).not.toContain("node:internal/child_process");
    expect(row.textContent).not.toContain("at onErrorNT");

    view.cleanup();
  });
});
