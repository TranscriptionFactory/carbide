import { describe, expect, it, vi } from "vitest";
import { RagService } from "$lib/features/rag";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";
import type { AiStreamChunk } from "$lib/features/ai";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { HybridSearchHit } from "$lib/shared/types/search";

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

function hit(
  path: string,
  title: string,
  id: string,
  score: number,
): HybridSearchHit {
  return { note: note_meta(path, title, id) as never, score, source: "both" };
}

function stream_of(...chunks: AiStreamChunk[]) {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    stream_text: vi.fn(async function* () {
      for (const chunk of chunks) yield chunk;
    }),
    abort: vi.fn(),
  };
}

function make_vault_store() {
  const store = new VaultStore();
  store.set_vault(create_test_vault({ path: "/vault/demo" as never }));
  return store;
}

function text_stream(text: string) {
  return stream_of({ type: "text", text }, { type: "done" });
}

describe("RagService.query", () => {
  it("retrieves, answers, and cites the note that holds the answer", async () => {
    const search = {
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/q.md", "Q", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "The answer is 42." }),
    };
    const stream = text_stream("The answer is 42 [1].");
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
    );

    const result = await service.query({
      question: "what is it?",
      provider_config: provider,
    });

    expect(search.hybrid_search).toHaveBeenCalledWith(
      expect.anything(),
      { raw: "what is it?", text: "what is it?", scope: "all" },
      15,
    );
    expect(result.status).toBe("answered");
    expect(result.content).toContain("[1]");
    expect(result.citations).toEqual([
      { index: 1, note_path: "notes/q.md", title: "Q" },
    ]);
    expect(result.contexts).toHaveLength(1);
  });

  it("returns no_results without calling the model when retrieval is empty", async () => {
    const search = { hybrid_search: vi.fn().mockResolvedValue([]) };
    const notes = { read_note: vi.fn() };
    const stream = text_stream("unused");
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
    );

    const result = await service.query({
      question: "x",
      provider_config: provider,
    });

    expect(result.status).toBe("no_results");
    expect(result.citations).toEqual([]);
    expect(notes.read_note).not.toHaveBeenCalled();
    expect(stream.stream_text).not.toHaveBeenCalled();
  });

  it("drops citations that do not map to a retrieved source", async () => {
    const search = {
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/q.md", "Q", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const stream = text_stream("Real [1], fake [7].");
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
    );

    const result = await service.query({
      question: "q",
      provider_config: provider,
    });

    expect(result.citations.map((c) => c.index)).toEqual([1]);
  });

  it("falls back to no_results when every retrieved note fails to read", async () => {
    const search = {
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/q.md", "Q", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockRejectedValue(new Error("gone")),
    };
    const stream = text_stream("unused");
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
    );

    const result = await service.query({
      question: "q",
      provider_config: provider,
    });

    expect(result.status).toBe("no_results");
    expect(stream.stream_text).not.toHaveBeenCalled();
  });

  it("fails when retrieval throws", async () => {
    const search = {
      hybrid_search: vi.fn().mockRejectedValue(new Error("index down")),
    };
    const service = new RagService(
      search as never,
      { read_note: vi.fn() } as never,
      text_stream("x") as never,
      make_vault_store(),
    );

    const result = await service.query({
      question: "q",
      provider_config: provider,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBeTruthy();
  });

  it("fails when the stream errors before producing text", async () => {
    const search = {
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/q.md", "Q", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const stream = stream_of({ type: "error", error: "model crashed" });
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
    );

    const result = await service.query({
      question: "q",
      provider_config: provider,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("model crashed");
  });

  it("fails when there is no active vault", async () => {
    const service = new RagService(
      { hybrid_search: vi.fn() } as never,
      { read_note: vi.fn() } as never,
      text_stream("x") as never,
      new VaultStore(),
    );

    const result = await service.query({
      question: "q",
      provider_config: provider,
    });

    expect(result.status).toBe("failed");
  });
});
