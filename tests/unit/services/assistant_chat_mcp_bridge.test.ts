import { describe, expect, it, vi } from "vitest";
import { collect_chat_query_response } from "$lib/features/assistant";
import type { RunEvent } from "$lib/features/assistant";
import { create_test_run_starter } from "../../adapters/test_run_starter";
import { create_chat_seam } from "../helpers/assistant_chat_seam";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type {
  AssistantCitation,
  AssistantChatStreamEvent,
} from "$lib/features/assistant";

const tag = { get_notes_for_tag: vi.fn().mockResolvedValue([]) };

const provider: AiProviderConfig = {
  id: "ollama",
  name: "Ollama",
  transport: { kind: "cli", command: "ollama", args: ["run", "{model}"] },
  model: "qwen3:8b",
};

function note_meta(path: string, title: string, id: string) {
  return {
    id,
    path,
    name: title.toLowerCase(),
    title,
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 100,
    file_type: "md",
  };
}

// The whole point of this file is that both collectors see the same events from
// the same REAL retrieval — citation index 1 below is produced by actual
// retrieval and assembly, not by a canned port response.
function make_service(...events: RunEvent[]) {
  const search = {
    search_blocks: vi.fn().mockResolvedValue([]),
    hybrid_search: vi
      .fn()
      .mockResolvedValue([
        { note: note_meta("notes/q.md", "Q", "1"), score: 0.9, source: "both" },
      ]),
  };
  const notes = {
    read_note: vi.fn().mockResolvedValue({ markdown: "The answer is 42." }),
  };
  return create_chat_seam({
    search,
    notes,
    tag,
    bases: { load_view: vi.fn(), query: vi.fn() },
    run_starter: create_test_run_starter(() => events) as never,
  }).chat;
}

async function in_app_collect(gen: AsyncGenerator<AssistantChatStreamEvent>) {
  let content = "";
  const citations: AssistantCitation[] = [];
  let error: string | null = null;
  for await (const event of gen) {
    if (event.type === "text") content += event.text;
    else if (event.type === "citation") citations.push(event.citation);
    else if (event.type === "error") error = event.error;
  }
  return { content, citations, error };
}

describe("collect_chat_query_response", () => {
  it("returns the same answer and citations as the in-app path for the same question", async () => {
    const events: RunEvent[] = [
      { type: "text", text: "The answer is 42 [1]." },
      { type: "done" },
    ];

    const in_app = await in_app_collect(
      make_service(...events).query({
        question: "what is it?",
        provider_config: provider,
      }),
    );

    const mcp = await collect_chat_query_response(
      make_service(...events).query({
        question: "what is it?",
        provider_config: provider,
      }),
    );

    expect(mcp.answer).toBe(in_app.content);
    expect(mcp.citations).toEqual(in_app.citations);
    expect(mcp.error).toBe(in_app.error);
    expect(mcp.citations).toEqual([
      { index: 1, note_path: "notes/q.md", title: "Q" },
    ]);
  });

  it("surfaces a stream error as a normalized response error", async () => {
    const mcp = await collect_chat_query_response(
      make_service({
        type: "error",
        message: "Ollama request failed — see logs for details.",
      }).query({
        question: "q",
        provider_config: provider,
      }),
    );

    expect(mcp.error).toBe("Ollama request failed — see logs for details.");
  });
});
