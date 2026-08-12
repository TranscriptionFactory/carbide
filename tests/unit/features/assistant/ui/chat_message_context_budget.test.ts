/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);

import RagMessageView from "$lib/features/assistant/ui/chat_message.svelte";
import type { AssistantMessage } from "$lib/features/assistant";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import type { AppContext } from "$lib/app/di/create_app_context";

let cleanups: Array<() => void> = [];

function make_message(overrides?: Partial<AssistantMessage>): AssistantMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "Done.",
    citations: [],
    ...overrides,
  };
}

function render_message(message: AssistantMessage) {
  const rendered = render_with_app_context(RagMessageView, {
    app_context: {
      stores: {
        editor: { open_note: null },
        vault: { vault: { path: "/vault/root" } },
      },
      action_registry: { execute: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Partial<AppContext>,
    props: { message },
  });
  cleanups.push(() => rendered.cleanup());
  return rendered.target;
}

function meter(target: HTMLElement) {
  return target.querySelector('[role="progressbar"]');
}

// The template wraps mid-sentence, so assert against collapsed whitespace.
function text(target: HTMLElement) {
  return (target.textContent ?? "").replace(/\s+/g, " ");
}

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
});

describe("AssistantMessage Ask retrieval budget meter", () => {
  it("reports the share of the retrieval budget an Ask turn spent", () => {
    const target = render_message(
      make_message({
        context_stats: {
          retrieved: 3,
          used: 3,
          truncated: 0,
          chars_used: 5500,
          chars_available: 22000,
        },
      }),
    );

    expect(text(target)).toContain(
      "Retrieval budget 25% used (5500 of 22000 characters)",
    );
    expect(meter(target)?.getAttribute("aria-valuenow")).toBe("25");
  });

  it("names the budget as retrieval characters, never a token window", () => {
    const target = render_message(
      make_message({
        context_stats: {
          retrieved: 1,
          used: 1,
          truncated: 0,
          chars_used: 100,
          chars_available: 400,
        },
      }),
    );

    expect(text(target)).not.toMatch(/token/i);
    expect(text(target)).not.toMatch(/context window/i);
    expect(meter(target)?.getAttribute("aria-label")).toBe(
      "Ask retrieval budget used",
    );
  });

  it("shows the meter on a turn that used every note, where the note line stays hidden", () => {
    const target = render_message(
      make_message({
        context_stats: {
          retrieved: 2,
          used: 2,
          truncated: 0,
          chars_used: 1000,
          chars_available: 4000,
        },
      }),
    );

    expect(text(target)).not.toContain("retrieved notes");
    expect(meter(target)).not.toBeNull();
  });

  it("caps a budget overrun at 100% rather than reporting past full", () => {
    const target = render_message(
      make_message({
        context_stats: {
          retrieved: 1,
          used: 1,
          truncated: 1,
          chars_used: 5000,
          chars_available: 4000,
        },
      }),
    );

    expect(meter(target)?.getAttribute("aria-valuenow")).toBe("100");
  });
});

describe("AssistantMessage without a retrieval budget", () => {
  it("shows no meter for an agent turn, which carries no assembled context", () => {
    const target = render_message(
      make_message({
        tool_events: [
          {
            name: "mcp__carbide__read_note",
            input_summary: '{"path":"notes/a.md"}',
            ok: true,
          },
        ],
      }),
    );

    expect(text(target)).toContain("Sources");
    expect(text(target)).not.toContain("Retrieval budget");
    expect(meter(target)).toBeNull();
  });

  it("shows no meter for a session persisted before the budget was recorded", () => {
    const target = render_message(
      make_message({ context_stats: { retrieved: 4, used: 2, truncated: 0 } }),
    );

    expect(text(target)).toContain("retrieved notes");
    expect(text(target)).not.toContain("Retrieval budget");
    expect(meter(target)).toBeNull();
  });

  it("shows no meter when the turn ran without a budget denominator", () => {
    const target = render_message(
      make_message({
        context_stats: {
          retrieved: 2,
          used: 2,
          truncated: 0,
          chars_used: 900,
          chars_available: 0,
        },
      }),
    );

    expect(meter(target)).toBeNull();
  });
});
