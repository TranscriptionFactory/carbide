import { describe, expect, it, vi } from "vitest";
import { RagService } from "$lib/features/rag";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";
import { create_test_rag_persistence_adapter } from "../../adapters/test_rag_persistence_adapter";
import type { AiStreamChunk, AiStreamRequest } from "$lib/features/ai";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type {
  BlockSectionHit,
  HybridSearchHit,
} from "$lib/shared/types/search";
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

function hit(
  path: string,
  title: string,
  id: string,
  score: number,
): HybridSearchHit {
  return { note: note_meta(path, title, id) as never, score, source: "both" };
}

function block_hit(
  path: string,
  title: string,
  id: string,
  start_line: number,
  end_line: number,
  distance: number,
): BlockSectionHit {
  return {
    note: note_meta(path, title, id) as never,
    heading_id: "h",
    heading: title,
    start_line,
    end_line,
    distance,
  };
}

function stream_of(...chunks: AiStreamChunk[]) {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    stream_text: vi.fn(async function* () {
      for (const chunk of chunks) yield chunk;
    }),
  };
}

function capturing_stream(...texts: string[]) {
  const captured: { signal: AbortSignal | undefined } = { signal: undefined };
  const stream = {
    stream_text: vi.fn((input: AiStreamRequest) => {
      captured.signal = input.signal;
      // eslint-disable-next-line @typescript-eslint/require-await
      return (async function* () {
        for (const text of texts) {
          yield { type: "text", text } as AiStreamChunk;
        }
        yield { type: "done" } as AiStreamChunk;
      })();
    }),
  };
  return { stream, captured };
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
      search_blocks: vi.fn().mockResolvedValue([]),
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
      tag as never,
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

  it("reads linked-source hits from the index instead of the filesystem", async () => {
    const linked_path = "@linked/papers/clustering.pdf";
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit(linked_path, "Clustering", "linked-1", 0.9)]),
      get_indexed_body: vi
        .fn()
        .mockResolvedValue("Clustering is significant for high dimensions."),
    };
    const notes = {
      read_note: vi.fn().mockRejectedValue(new Error("No such file")),
    };
    const stream = text_stream("It is significant [1].");
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
      persistence,
      tag as never,
    );

    const result = await collect(
      service.query({ question: "is clustering significant?", provider_config: provider }),
    );

    expect(search.get_indexed_body).toHaveBeenCalledWith(
      expect.anything(),
      linked_path,
    );
    expect(notes.read_note).not.toHaveBeenCalled();
    expect(result.citations).toEqual([
      { index: 1, note_path: linked_path, title: "Clustering" },
    ]);
    expect(result.error).toBeNull();
  });

  it("retrieves the answering section of a long note and stays within budget", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 400; i++) lines.push(`intro filler line ${i}`);
    const start = lines.length;
    lines.push("## Deployment");
    lines.push("The service deploys to Fly.io every night.");
    const end = lines.length - 1;
    for (let i = 0; i < 400; i++) lines.push(`tail filler line ${i}`);
    const markdown = lines.join("\n");

    const search = {
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/ops.md", "Ops", "1", 0.9)]),
      search_blocks: vi
        .fn()
        .mockResolvedValue([
          block_hit("notes/ops.md", "Ops", "1", start, end, 0.1),
        ]),
    };
    const notes = { read_note: vi.fn().mockResolvedValue({ markdown }) };
    const stream = text_stream("It deploys nightly to Fly.io [1].");
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
      persistence,
      tag as never,
    );

    const result = await collect(
      service.query({
        question: "where does it deploy?",
        provider_config: provider,
      }),
    );

    const call = stream.stream_text.mock.calls[0] as unknown[] | undefined;
    const request = call?.[0] as
      | { messages: { content: string }[] }
      | undefined;
    const user_prompt = request?.messages[0]?.content ?? "";
    expect(user_prompt).toContain("deploys to Fly.io every night");
    expect(user_prompt).not.toContain("intro filler line 200");
    expect(result.citations).toEqual([
      { index: 1, note_path: "notes/ops.md", title: "Ops" },
    ]);
  });

  it("keeps hybrid keyword recall even when block search returns only unrelated sections", async () => {
    const search = {
      hybrid_search: vi
        .fn()
        .mockResolvedValue([
          hit("notes/metaboloformer.md", "Metaboloformer", "1", 0.95),
        ]),
      search_blocks: vi
        .fn()
        .mockResolvedValue([
          block_hit("notes/other.md", "Other", "2", 0, 1, 0.2),
        ]),
    };
    const notes = {
      read_note: vi.fn().mockImplementation((_vault: unknown, id: string) =>
        Promise.resolve({
          markdown:
            id === "1"
              ? "Metaboloformer is a transformer model for metabolomics."
              : "Unrelated content.",
        }),
      ),
    };
    const stream = text_stream(
      "Metaboloformer is a transformer for metabolomics [1].",
    );
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
      persistence,
      tag as never,
    );

    const result = await collect(
      service.query({
        question: "what is metaboloformer",
        provider_config: provider,
      }),
    );

    expect(result.citations.map((c) => c.note_path)).toContain(
      "notes/metaboloformer.md",
    );
    expect(notes.read_note.mock.calls.map((call) => call[1])).toContain("1");
    const call = stream.stream_text.mock.calls[0] as unknown[] | undefined;
    const request = call?.[0] as
      | { messages: { content: string }[] }
      | undefined;
    expect(request?.messages[0]?.content ?? "").toContain(
      "transformer model for metabolomics",
    );
  });

  it("pins an @mentioned note into context regardless of retrieval score", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/other.md", "Other", "2", 0.9)]),
      suggest_wiki_links: vi.fn().mockResolvedValue([
        {
          kind: "existing",
          note: note_meta("notes/spec.md", "Spec", "1"),
          score: 1,
        },
      ]),
    };
    const notes = {
      read_note: vi.fn().mockImplementation((_vault: unknown, id: string) =>
        Promise.resolve({
          markdown:
            id === "1" ? "Spec body: the cutoff is 30 days." : "Other body.",
        }),
      ),
    };
    const stream = text_stream("Per the spec [1] and other [2].");
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
      persistence,
      tag as never,
    );

    const result = await collect(
      service.query({
        question: "summarize @spec please",
        provider_config: provider,
      }),
    );

    expect(search.suggest_wiki_links).toHaveBeenCalledWith(
      expect.anything(),
      "spec",
      1,
    );
    expect(result.citations.map((c) => c.note_path)).toContain("notes/spec.md");

    const call = stream.stream_text.mock.calls[0] as unknown[] | undefined;
    const request = call?.[0] as
      | { messages: { content: string }[] }
      | undefined;
    expect(request?.messages[0]?.content ?? "").toContain("cutoff is 30 days");
  });

  it("renders a citation split across two stream chunks once", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
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
      tag as never,
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
      search_blocks: vi.fn().mockResolvedValue([]),
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
      tag as never,
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
      search_blocks: vi.fn().mockResolvedValue([]),
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
      tag as never,
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

  it("restricts retrieved sources to notes carrying the tag scope", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
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
    const tag_port = {
      get_notes_for_tag: vi.fn().mockResolvedValue(["projects/a.md"]),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("Answer [1].") as never,
      make_vault_store(),
      persistence,
      tag_port as never,
    );

    await collect(
      service.query({
        question: "what is it?",
        provider_config: provider,
        scope: { tag: "#active" },
      }),
    );

    expect(tag_port.get_notes_for_tag).toHaveBeenCalledWith(
      expect.anything(),
      "active",
    );
    const read_ids = notes.read_note.mock.calls.map((call) => call[1]);
    expect(read_ids).toEqual(["1"]);
  });

  it("returns no_results when the scope filters out every hit", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
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
      tag as never,
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
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
    };
    const notes = { read_note: vi.fn() };
    const stream = text_stream("unused");
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
      persistence,
      tag as never,
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
      search_blocks: vi.fn().mockResolvedValue([]),
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
      tag as never,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.citations.map((c) => c.index)).toEqual([1]);
  });

  it("falls back to no_results when every retrieved note fails to read", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
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
      tag as never,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.content).toMatch(/couldn't find/i);
    expect(stream.stream_text).not.toHaveBeenCalled();
  });

  it("fails when retrieval throws", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockRejectedValue(new Error("index down")),
    };
    const service = new RagService(
      search as never,
      { read_note: vi.fn() } as never,
      text_stream("x") as never,
      make_vault_store(),
      persistence,
      tag as never,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.error).toBeTruthy();
  });

  it("fails when the stream errors before producing text", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
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
      tag as never,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.error).toBe("model crashed");
  });

  it("aborts the backend stream when the consumer abandons the turn mid-stream", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/q.md", "Q", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const { stream, captured } = capturing_stream(
      "first part ",
      "second part ",
      "third part",
    );
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
      persistence,
      tag as never,
    );

    for await (const event of service.query({
      question: "q",
      provider_config: provider,
    })) {
      if (event.type === "text") break;
    }

    expect(captured.signal?.aborted).toBe(true);
  });

  it("does not abort the backend stream on natural completion", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/q.md", "Q", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const { stream, captured } = capturing_stream("All done.");
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
      persistence,
      tag as never,
    );

    let aborted_during_stream = false;
    for await (const event of service.query({
      question: "q",
      provider_config: provider,
    })) {
      if (event.type === "text" && captured.signal?.aborted) {
        aborted_during_stream = true;
      }
    }

    expect(aborted_during_stream).toBe(false);
  });

  it("fails when there is no active vault", async () => {
    const service = new RagService(
      { hybrid_search: vi.fn() } as never,
      { read_note: vi.fn() } as never,
      text_stream("x") as never,
      new VaultStore(),
      persistence,
      tag as never,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.error).toBeTruthy();
  });
});
