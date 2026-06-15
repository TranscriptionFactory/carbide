import { describe, expect, it, vi } from "vitest";
import { RagService } from "$lib/features/rag";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";
import { create_test_rag_persistence_adapter } from "../../adapters/test_rag_persistence_adapter";
import type { AiStreamChunk } from "$lib/features/ai";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { HybridSearchHit } from "$lib/shared/types/search";
import type {
  RagCitation,
  RagStreamEvent,
} from "$lib/features/rag/domain/rag_types";

const persistence = create_test_rag_persistence_adapter();

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

function text_stream(...texts: string[]) {
  return stream_of(
    ...texts.map((text): AiStreamChunk => ({ type: "text", text })),
    { type: "done" },
  );
}

type Collected = {
  content: string;
  citations: RagCitation[];
  error: string | null;
};

async function collect(
  gen: AsyncGenerator<RagStreamEvent>,
): Promise<Collected> {
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
      persistence,
    );

    const result = await collect(
      service.query({ question: "what is it?", provider_config: provider }),
    );

    expect(search.hybrid_search).toHaveBeenCalledWith(
      expect.anything(),
      { raw: "what is it?", text: "what is it?", scope: "all" },
      15,
    );
    expect(result.content).toContain("[1]");
    expect(result.citations).toEqual([
      { index: 1, note_path: "notes/q.md", title: "Q" },
    ]);
    expect(result.error).toBeNull();
  });

  it("renders a citation split across two stream chunks once", async () => {
    const search = {
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/q.md", "Q", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const stream = text_stream("The answer is 42 [", "1].");
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
      persistence,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.content).toBe("The answer is 42 [1].");
    expect(result.citations).toEqual([
      { index: 1, note_path: "notes/q.md", title: "Q" },
    ]);
  });

  it("retrieves on the rewritten standalone query for a follow-up", async () => {
    const search = {
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/q.md", "Q", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("Because [1].") as never,
      make_vault_store(),
      persistence,
    );

    await collect(
      service.query({
        question: "why?",
        provider_config: provider,
        history: [
          {
            id: "u1",
            role: "user",
            content: "Does it use Postgres?",
            citations: [],
          },
          { id: "a1", role: "assistant", content: "Yes.", citations: [] },
        ],
      }),
    );

    const query = search.hybrid_search.mock.calls[0]?.[1];
    expect(query?.text).toContain("Postgres");
    expect(query?.text).not.toBe("why?");
  });

  it("restricts retrieved sources to the folder scope", async () => {
    const search = {
      hybrid_search: vi
        .fn()
        .mockResolvedValue([
          hit("projects/a.md", "A", "1", 0.9),
          hit("archive/b.md", "B", "2", 0.8),
        ]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("Answer [1].") as never,
      make_vault_store(),
      persistence,
    );

    await collect(
      service.query({
        question: "what is it?",
        provider_config: provider,
        scope: { folder: "projects" },
      }),
    );

    const read_ids = notes.read_note.mock.calls.map((call) => call[1]);
    expect(read_ids).toEqual(["1"]);
  });

  it("returns no_results when the scope filters out every hit", async () => {
    const search = {
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("archive/b.md", "B", "2", 0.8)]),
    };
    const notes = { read_note: vi.fn() };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("unused") as never,
      make_vault_store(),
      persistence,
    );

    const result = await collect(
      service.query({
        question: "q",
        provider_config: provider,
        scope: { folder: "projects" },
      }),
    );

    expect(result.content).toMatch(/couldn't find/i);
    expect(notes.read_note).not.toHaveBeenCalled();
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
      persistence,
    );

    const result = await collect(
      service.query({ question: "x", provider_config: provider }),
    );

    expect(result.content).toMatch(/couldn't find/i);
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
      persistence,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

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
      persistence,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.content).toMatch(/couldn't find/i);
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
      persistence,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

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
      persistence,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.error).toBe("model crashed");
  });

  it("fails when there is no active vault", async () => {
    const service = new RagService(
      { hybrid_search: vi.fn() } as never,
      { read_note: vi.fn() } as never,
      text_stream("x") as never,
      new VaultStore(),
      persistence,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.error).toBeTruthy();
  });
});
