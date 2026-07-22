/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import RagMessageView from "$lib/features/rag/ui/rag_message.svelte";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { RagMessage } from "$lib/features/rag/domain/rag_types";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import type { AppContext } from "$lib/app/di/create_app_context";

let cleanups: Array<() => void> = [];

function make_message(overrides?: Partial<RagMessage>): RagMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "Done.",
    citations: [],
    ...overrides,
  };
}

function render_message(props: {
  message: RagMessage;
  is_streaming?: boolean;
  changed_files?: string[];
}) {
  const execute = vi.fn().mockResolvedValue(undefined);
  const rendered = render_with_app_context(RagMessageView, {
    app_context: {
      stores: { editor: { open_note: null } },
      action_registry: { execute },
    } as unknown as Partial<AppContext>,
    props,
  });
  cleanups.push(rendered.cleanup);
  return { target: rendered.target, execute };
}

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
});

describe("RagMessage tool events", () => {
  it("shows a spinner for a running tool and settles into check or cross", () => {
    const { target } = render_message({
      message: make_message({
        tool_events: [
          { name: "write_note", input_summary: "inbox/a.md", ok: true },
          { name: "search_notes", input_summary: "projects", ok: false },
          { name: "read_note", input_summary: "inbox/b.md" },
        ],
      }),
      is_streaming: true,
    });
    expect(target.textContent).toContain("Tool calls");
    expect(target.textContent).toContain("write_note");
    expect(target.textContent).toContain("inbox/a.md");
    expect(target.querySelectorAll(".animate-spin")).toHaveLength(1);
    expect(target.querySelectorAll('[aria-label="Succeeded"]')).toHaveLength(1);
    expect(target.querySelectorAll('[aria-label="Failed"]')).toHaveLength(1);
  });

  it("renders no tool block for a plain message", () => {
    const { target } = render_message({ message: make_message() });
    expect(target.textContent).not.toContain("Tool calls");
  });
});

describe("RagMessage changed files", () => {
  it("lists changed files and opens the note on click", () => {
    const { target, execute } = render_message({
      message: make_message(),
      changed_files: ["inbox/organized.md", "projects/plan.md"],
    });
    expect(target.textContent).toContain("Changed files");
    const buttons = [...target.querySelectorAll("button")].filter((el) =>
      el.textContent?.includes("projects/plan.md"),
    );
    expect(buttons).toHaveLength(1);
    buttons[0]?.click();
    expect(execute).toHaveBeenCalledWith(
      ACTION_IDS.rag_open_citation,
      "projects/plan.md",
    );
  });

  it("omits the block when no files changed", () => {
    const { target } = render_message({ message: make_message() });
    expect(target.textContent).not.toContain("Changed files");
  });
});
