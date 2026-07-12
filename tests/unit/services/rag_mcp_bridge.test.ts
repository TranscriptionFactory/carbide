import { describe, expect, it, vi } from "vitest";
import { RagService, collect_rag_query_response } from "$lib/features/rag";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";
import { create_test_rag_persistence_adapter } from "../../adapters/test_rag_persistence_adapter";
import type { AiStreamChunk } from "$lib/features/ai";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type {
  RagCitation,
  RagStreamEvent,
} from "$lib/features/rag/domain/rag_types";

const persistence = create_test_rag_persistence_adapter();
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

function make_service(...chunks: AiStreamChunk[]) {
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
  const stream = {
    // eslint-disable-next-line @typescript-eslint/require-await
    stream_text: vi.fn(async function* () {
      for (const chunk of chunks) yield chunk;
    }),
    abort: vi.fn(),
  };
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault({ path: "/vault/demo" as never }));
  return new RagService(
    search as never,
    notes as never,
    stream as never,
    vault_store,
    persistence,
    tag as never,
    { load_view: vi.fn(), query: vi.fn() } as never,
  );
}

async function in_app_collect(gen: AsyncGenerator<RagStreamEvent>) {
  let content = "";
  const citations: RagCitation[] = [];
  let error: string | null = null;
  for await (const event of gen) {
    if (event.type === "text") content += event.text;
    else if (event.type === "citation") citations.push(event.citation);
    else if (event.type === "error") error = event.error;
  }
  return { content, citations, error };
}

describe("collect_rag_query_response", () => {
  it("returns the same answer and citations as the in-app path for the same question", async () => {
    const chunks: AiStreamChunk[] = [
      { type: "text", text: "The answer is 42 [1]." },
      { type: "done" },
    ];

    const in_app = await in_app_collect(
      make_service(...chunks).query({
        question: "what is it?",
        provider_config: provider,
      }),
    );

    const mcp = await collect_rag_query_response(
      make_service(...chunks).query({
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
    const mcp = await collect_rag_query_response(
      make_service({ type: "error", error: "model crashed" }).query({
        question: "q",
        provider_config: provider,
      }),
    );

    expect(mcp.error).toBe("Ollama request failed — see logs for details.");
  });
});
