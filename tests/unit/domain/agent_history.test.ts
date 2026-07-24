import { describe, expect, it } from "vitest";
import { rag_messages_to_history } from "$lib/features/rag/domain/agent_history";
import type { RagMessage, RagRole } from "$lib/features/rag/domain/rag_types";

function msg(
  partial: Partial<RagMessage> & { role: RagRole; content: string },
): RagMessage {
  return { id: crypto.randomUUID(), citations: [], ...partial };
}

describe("rag_messages_to_history", () => {
  it("maps roles, tool_calls, and tool_call_id in order", () => {
    const history = rag_messages_to_history([
      msg({ role: "user", content: "find the note" }),
      msg({
        role: "assistant",
        content: "searching",
        tool_calls: [{ id: "c1", name: "search", arguments: '{"q":"x"}' }],
      }),
      msg({ role: "tool", content: "one hit", tool_call_id: "c1" }),
      msg({ role: "assistant", content: "here it is" }),
    ]);

    expect(history.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(history[0]?.tool_calls).toBeUndefined();
    expect(history[1]?.tool_calls).toEqual([
      { id: "c1", name: "search", arguments: '{"q":"x"}' },
    ]);
    expect(history[2]?.tool_call_id).toBe("c1");
    expect(history[2]?.content).toBe("one hit");
    expect(history[3]?.tool_calls).toBeUndefined();
  });

  it("evicts oldest-first beyond the 40-message cap", () => {
    const messages = Array.from({ length: 45 }, (_, i) =>
      msg({ role: "user", content: `m${i}` }),
    );

    const history = rag_messages_to_history(messages);

    expect(history).toHaveLength(40);
    expect(history[0]?.content).toBe("m5");
    expect(history.at(-1)?.content).toBe("m44");
  });

  it("drops an orphaned tool result when its call was evicted by the cap", () => {
    const messages: RagMessage[] = [
      msg({
        role: "assistant",
        content: "searching",
        tool_calls: [{ id: "c1", name: "search", arguments: "{}" }],
      }),
      msg({ role: "tool", content: "hit", tool_call_id: "c1" }),
      ...Array.from({ length: 39 }, (_, i) =>
        msg({ role: "user", content: `u${i}` }),
      ),
    ];

    const history = rag_messages_to_history(messages);

    expect(history).toHaveLength(39);
    expect(history.every((m) => m.role !== "tool")).toBe(true);
    expect(history[0]?.content).toBe("u0");
  });
});
