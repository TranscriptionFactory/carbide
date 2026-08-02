import { describe, expect, it, vi } from "vitest";
import { RagService } from "$lib/features/rag";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";
import { create_test_rag_persistence_adapter } from "../../adapters/test_rag_persistence_adapter";
import type {
  RunEvent,
  RunHandle,
  RunSink,
  RunSpec,
} from "$lib/features/assistant";
import { create_test_run_starter } from "../../adapters/test_run_starter";
import { create_aborting_run_starter } from "../helpers/aborting_run_starter";
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
const bases = { load_view: vi.fn(), query: vi.fn() };

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

function stream_of(...events: RunEvent[]) {
  return create_test_run_starter(() => events);
}

function capturing_stream(...texts: string[]) {
  const captured = { stopped: false };
  const starter = create_test_run_starter(() =>
    (async function* () {
      for (const text of texts) {
        yield { type: "text", text } as RunEvent;
      }
      yield { type: "done" } as RunEvent;
    })(),
  );
  const stream = {
    async start(spec: RunSpec, sink?: RunSink): Promise<RunHandle> {
      const handle = await starter.start(spec, sink);
      return {
        ...handle,
        stop: () => {
          captured.stopped = true;
          handle.stop();
        },
      };
    },
  };
  return { stream, captured };
}

function make_vault_store() {
  const store = new VaultStore();
  store.set_vault(create_test_vault({ path: "/vault/demo" as never }));
  return store;
}

function text_stream(...texts: string[]) {
  return stream_of(...texts.map((text): RunEvent => ({ type: "text", text })), {
    type: "done",
  });
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
      bases as never,
    );

    const result = await collect(
      service.query({ question: "what is it?", provider_config: provider }),
    );

    expect(search.hybrid_search).toHaveBeenCalledWith(
      expect.anything(),
      { raw: "what is it?", text: "what is it?", scope: "all" },
      15,
      null,
    );
    expect(result.content).toContain("[1]");
    expect(result.citations).toEqual([
      { index: 1, note_path: "notes/q.md", title: "Q" },
    ]);
    expect(result.error).toBeNull();
  });

  it("forwards reasoning chunks without feeding them to the citation parser", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/q.md", "Q", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "The answer is 42." }),
    };
    const stream = stream_of(
      { type: "reasoning", text: "thinking about [1] a lot" },
      { type: "text", text: "The answer is 42 [1]." },
      { type: "done" },
    );
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    let reasoning = "";
    let content = "";
    const citations: RagCitation[] = [];
    for await (const event of service.query({
      question: "what is it?",
      provider_config: provider,
    })) {
      if (event.type === "reasoning") reasoning += event.text;
      else if (event.type === "text") content += event.text;
      else if (event.type === "citation") citations.push(event.citation);
    }

    expect(reasoning).toBe("thinking about [1] a lot");
    expect(content).not.toContain("thinking");
    expect(citations).toEqual([
      { index: 1, note_path: "notes/q.md", title: "Q" },
    ]);
  });

  it("retrieves the bare topic and a date window for a meta-query", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/m.md", "M", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Metaboloformer." }),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("done [1].") as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    await collect(
      service.query({
        question:
          "tell me about the notes I wrote about metaboloformer last week",
        provider_config: provider,
      }),
    );

    const call = search.hybrid_search.mock.calls[0];
    expect(call?.[1]).toMatchObject({ text: "metaboloformer" });
    expect(call?.[3]).toMatchObject({
      start_ms: expect.any(Number),
      end_ms: expect.any(Number),
    });
    expect(search.search_blocks.mock.calls[0]?.[1]).toBe("metaboloformer");
  });

  it("over-fetches when a scope is active so filtered hits survive", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("journal/a.md", "A", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Entry." }),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("done [1].") as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    await collect(
      service.query({
        question: "standup notes",
        provider_config: provider,
        scope: { folders: ["journal"] },
      }),
    );

    expect(search.hybrid_search.mock.calls[0]?.[2]).toBe(15 * 6);
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
      bases as never,
    );

    const result = await collect(
      service.query({
        question: "is clustering significant?",
        provider_config: provider,
      }),
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
      bases as never,
    );

    const result = await collect(
      service.query({
        question: "where does it deploy?",
        provider_config: provider,
      }),
    );

    const request = stream.specs[0]?.request;
    if (request?.mode !== "text") throw new Error("expected a text run");
    const user_prompt = String(request.messages[0]?.content ?? "");
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
      bases as never,
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
    const request = stream.specs[0]?.request;
    if (request?.mode !== "text") throw new Error("expected a text run");
    expect(String(request.messages[0]?.content ?? "")).toContain(
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
      bases as never,
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

    const request = stream.specs[0]?.request;
    if (request?.mode !== "text") throw new Error("expected a text run");
    expect(String(request.messages[0]?.content ?? "")).toContain(
      "cutoff is 30 days",
    );
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
      bases as never,
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
      bases as never,
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
      bases as never,
    );

    await collect(
      service.query({
        question: "what is it?",
        provider_config: provider,
        scope: { folders: ["projects"] },
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
      bases as never,
    );

    await collect(
      service.query({
        question: "what is it?",
        provider_config: provider,
        scope: { tags: ["#active"] },
      }),
    );

    expect(tag_port.get_notes_for_tag).toHaveBeenCalledWith(
      expect.anything(),
      "active",
    );
    const read_ids = notes.read_note.mock.calls.map((call) => call[1]);
    expect(read_ids).toEqual(["1"]);
  });

  it("restricts retrieved sources to the base view's note-set", async () => {
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
    const bases_port = {
      load_view: vi.fn().mockResolvedValue({
        query: { filters: [], sort: [], limit: 50, offset: 0 },
      }),
      query: vi.fn().mockResolvedValue({
        rows: [{ note: { path: "projects/a.md" } }],
        total: 1,
      }),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("Answer [1].") as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases_port as never,
    );

    await collect(
      service.query({
        question: "what is it?",
        provider_config: provider,
        scope: { bases: ["views/active.base"] },
      }),
    );

    expect(bases_port.load_view).toHaveBeenCalledWith(
      expect.anything(),
      "views/active.base",
    );
    const read_ids = notes.read_note.mock.calls.map((call) => call[1]);
    expect(read_ids).toEqual(["1"]);
  });

  it("raises the base query limit so a small saved-view page size cannot truncate the note-set", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("projects/a.md", "A", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const bases_port = {
      load_view: vi.fn().mockResolvedValue({
        query: { filters: [], sort: [], limit: 5, offset: 10 },
      }),
      query: vi.fn().mockResolvedValue({
        rows: [{ note: { path: "projects/a.md" } }],
        total: 1,
      }),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("Answer [1].") as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases_port as never,
    );

    await collect(
      service.query({
        question: "what is it?",
        provider_config: provider,
        scope: { bases: ["views/active.base"] },
      }),
    );

    expect(bases_port.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 10000, offset: 0 }),
    );
  });

  it("keeps a hit matched by any of several folder scopes", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([
          hit("projects/a.md", "A", "1", 0.9),
          hit("archive/b.md", "B", "2", 0.8),
          hit("other/c.md", "C", "3", 0.7),
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
      bases as never,
    );

    await collect(
      service.query({
        question: "what is it?",
        provider_config: provider,
        scope: { folders: ["projects", "archive"] },
      }),
    );

    const read_ids = notes.read_note.mock.calls.map((call) => call[1]);
    expect(read_ids).toEqual(["1", "2"]);
  });

  it("intersects folder and tag scopes across categories", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([
          hit("projects/a.md", "A", "1", 0.9),
          hit("projects/b.md", "B", "2", 0.8),
          hit("archive/c.md", "C", "3", 0.7),
        ]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const tag_port = {
      get_notes_for_tag: vi
        .fn()
        .mockResolvedValue(["projects/b.md", "archive/c.md"]),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("Answer [1].") as never,
      make_vault_store(),
      persistence,
      tag_port as never,
      bases as never,
    );

    await collect(
      service.query({
        question: "what is it?",
        provider_config: provider,
        scope: { folders: ["projects"], tags: ["active"] },
      }),
    );

    const read_ids = notes.read_note.mock.calls.map((call) => call[1]);
    expect(read_ids).toEqual(["2"]);
  });

  it("surfaces an error and refuses to search outside scope when a base view fails to load", async () => {
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
    const bases_port = {
      load_view: vi.fn().mockRejectedValue(new Error("missing view")),
      query: vi.fn(),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("Answer [1].") as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases_port as never,
    );

    const result = await collect(
      service.query({
        question: "what is it?",
        provider_config: provider,
        scope: { bases: ["views/missing.base"] },
      }),
    );

    expect(result.error).toMatch(/scope filter/i);
    expect(notes.read_note).not.toHaveBeenCalled();
  });

  it("surfaces an error rather than widening when a tag scope lookup throws", async () => {
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
      get_notes_for_tag: vi.fn().mockRejectedValue(new Error("index down")),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("Answer [1].") as never,
      make_vault_store(),
      persistence,
      tag_port as never,
      bases as never,
    );

    const result = await collect(
      service.query({
        question: "what is it?",
        provider_config: provider,
        scope: { tags: ["#active"] },
      }),
    );

    expect(result.error).toMatch(/scope filter/i);
    expect(notes.read_note).not.toHaveBeenCalled();
  });

  it("never calls scope ports when scope arrays are empty", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("projects/a.md", "A", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const tag_port = { get_notes_for_tag: vi.fn() };
    const bases_port = { load_view: vi.fn(), query: vi.fn() };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("Answer [1].") as never,
      make_vault_store(),
      persistence,
      tag_port as never,
      bases_port as never,
    );

    await collect(
      service.query({
        question: "what is it?",
        provider_config: provider,
        scope: { folders: [], tags: [], bases: [] },
      }),
    );

    expect(tag_port.get_notes_for_tag).not.toHaveBeenCalled();
    expect(bases_port.load_view).not.toHaveBeenCalled();
    expect(bases_port.query).not.toHaveBeenCalled();
  });

  it("says the scope filtered everything when raw retrieval had hits", async () => {
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
      bases as never,
    );

    const result = await collect(
      service.query({
        question: "q",
        provider_config: provider,
        scope: { folders: ["projects"] },
      }),
    );

    expect(result.content).toContain("scope filtered them all out");
    expect(result.content).toMatch(/widening or clearing/i);
    expect(result.content).not.toMatch(/couldn't find/i);
    expect(notes.read_note).not.toHaveBeenCalled();
  });

  it("keeps the plain no-results reply when a scoped retrieval had no raw hits", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 5,
        embedded_notes: 5,
        model_version: "v1",
        is_embedding: false,
      }),
    };
    const service = new RagService(
      search as never,
      { read_note: vi.fn() } as never,
      text_stream("unused") as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    const result = await collect(
      service.query({
        question: "q",
        provider_config: provider,
        scope: { folders: ["projects"] },
      }),
    );

    expect(result.content).toMatch(/couldn't find/i);
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
      bases as never,
    );

    const result = await collect(
      service.query({ question: "x", provider_config: provider }),
    );

    expect(result.content).toMatch(/couldn't find/i);
    expect(result.citations).toEqual([]);
    expect(notes.read_note).not.toHaveBeenCalled();
    expect(stream.specs).toHaveLength(0);
  });

  it("explains an in-progress index instead of the canned no-results reply", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 20,
        embedded_notes: 3,
        model_version: "v1",
        is_embedding: false,
      }),
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
      bases as never,
    );

    const result = await collect(
      service.query({ question: "x", provider_config: provider }),
    );

    expect(result.content).toContain("still being indexed (3 of 20 notes)");
    expect(result.content).not.toMatch(/couldn't find anything in your vault/i);
    expect(stream.specs).toHaveLength(0);
  });

  it("reports how many retrieved sources were actually used", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([
          hit("notes/long.md", "Long", "1", 0.9),
          hit("notes/starved.md", "Starved", "2", 0.5),
        ]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "x".repeat(500) }),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("answer [1].") as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    const events: RagStreamEvent[] = [];
    for await (const event of service.query({
      question: "q",
      provider_config: provider,
      assembler_options: {
        token_budget: 100,
        reserve_tokens: 0,
        chars_per_token: 1,
        min_block_chars: 10,
      },
    })) {
      events.push(event);
    }

    const sources = events.find((e) => e.type === "sources");
    expect(sources).toEqual({
      type: "sources",
      stats: { retrieved: 2, used: 1, truncated: 1 },
      sources: [
        {
          note_path: "notes/long.md",
          title: "Long",
          score: 0.9,
          truncated: true,
          pinned: false,
        },
      ],
    });
  });

  it("marks pinned mentions in the sources event", async () => {
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
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const service = new RagService(
      search as never,
      notes as never,
      text_stream("answer [1].") as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    const events: RagStreamEvent[] = [];
    for await (const event of service.query({
      question: "summarize @spec please",
      provider_config: provider,
    })) {
      events.push(event);
    }

    const sources = events.find((e) => e.type === "sources");
    expect(sources?.type).toBe("sources");
    if (sources?.type !== "sources") return;
    expect(sources.sources).toEqual([
      {
        note_path: "notes/spec.md",
        title: "Spec",
        score: 0,
        truncated: false,
        pinned: true,
      },
      {
        note_path: "notes/other.md",
        title: "Other",
        score: 0.9,
        truncated: false,
        pinned: false,
      },
    ]);
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
      bases as never,
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
      bases as never,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.content).toMatch(/couldn't find/i);
    expect(stream.specs).toHaveLength(0);
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
      bases as never,
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
    // Humanization moved to the kernel, the single choke point; the service
    // now forwards that message rather than deriving its own.
    const stream = stream_of({
      type: "error",
      message: "Ollama request failed — see logs for details.",
    });
    const service = new RagService(
      search as never,
      notes as never,
      stream as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.error).toBe("Ollama request failed — see logs for details.");
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
      bases as never,
    );

    for await (const event of service.query({
      question: "q",
      provider_config: provider,
    })) {
      if (event.type === "text") break;
    }

    expect(captured.stopped).toBe(true);
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
      bases as never,
    );

    let aborted_during_stream = false;
    for await (const event of service.query({
      question: "q",
      provider_config: provider,
    })) {
      if (event.type === "text" && captured.stopped) {
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
      bases as never,
    );

    const result = await collect(
      service.query({ question: "q", provider_config: provider }),
    );

    expect(result.error).toBeTruthy();
  });

  // A stopped answer keeps the text it produced but must not render as a
  // finished one, so `done` is the event it may not emit.
  it("keeps partial text but never reports done when the run is stopped", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/q.md", "Q", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "The answer is 42." }),
    };
    const service = new RagService(
      search as never,
      notes as never,
      create_aborting_run_starter([
        { type: "text", text: "The answer is 4" },
      ]) as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    const seen: string[] = [];
    let content = "";
    for await (const event of service.query({
      question: "what is it?",
      provider_config: provider,
    })) {
      seen.push(event.type);
      if (event.type === "text") content += event.text;
    }

    expect(content).toBe("The answer is 4");
    expect(seen).not.toContain("done");
    expect(seen).not.toContain("error");
  });
});

describe("RagService.query context assembly", () => {
  const tight_budget = {
    token_budget: 100,
    reserve_tokens: 0,
    chars_per_token: 1,
    min_block_chars: 10,
  };

  function markdown_by_id(bodies: Record<string, string>) {
    return vi.fn((_vault: unknown, note_id: string) =>
      Promise.resolve({ markdown: bodies[note_id] ?? "" }),
    );
  }

  function make_service(search: object, notes: object) {
    return new RagService(
      search as never,
      notes as never,
      text_stream("answer [1].") as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );
  }

  async function sources_of(
    service: RagService,
    input: Parameters<RagService["query"]>[0],
  ) {
    for await (const event of service.query(input)) {
      if (event.type === "sources") return event;
    }
    throw new Error("expected a sources event");
  }

  function pinning(path: string, title: string, id: string) {
    return vi
      .fn()
      .mockResolvedValue([
        { kind: "existing", note: note_meta(path, title, id), score: 1 },
      ]);
  }

  const no_mentions = vi.fn().mockResolvedValue([]);

  it("protects a pinned note from being starved by retrieval", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([
          hit("notes/a.md", "A", "2", 0.9),
          hit("notes/b.md", "B", "3", 0.8),
        ]),
      suggest_wiki_links: pinning("notes/spec.md", "Spec", "1"),
    };
    const notes = {
      read_note: markdown_by_id({
        "1": "P".repeat(40),
        "2": "A".repeat(200),
        "3": "B".repeat(200),
      }),
    };

    const sources = await sources_of(make_service(search, notes), {
      question: "summarize @spec please",
      provider_config: provider,
      assembler_options: tight_budget,
    });

    const pinned = sources.sources.find((s) => s.note_path === "notes/spec.md");
    expect(pinned).toEqual({
      note_path: "notes/spec.md",
      title: "Spec",
      score: 0,
      truncated: false,
      pinned: true,
    });
    expect(sources.sources.map((s) => s.note_path)).not.toContain("notes/b.md");
  });

  it("truncates rather than drops a pinned note larger than the whole budget", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      suggest_wiki_links: pinning("notes/spec.md", "Spec", "1"),
    };
    const notes = { read_note: markdown_by_id({ "1": "P".repeat(500) }) };

    const sources = await sources_of(make_service(search, notes), {
      question: "@spec",
      provider_config: provider,
      assembler_options: tight_budget,
    });

    expect(sources.sources).toEqual([
      {
        note_path: "notes/spec.md",
        title: "Spec",
        score: 0,
        truncated: true,
        pinned: true,
      },
    ]);
    expect(sources.stats.truncated).toBe(1);
  });

  it("answers no-results rather than throwing when the budget cannot fit a pinned note", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      suggest_wiki_links: pinning("notes/spec.md", "Spec", "1"),
      get_embedding_status: vi.fn().mockResolvedValue({
        total: 10,
        embedded: 10,
        is_embedding: false,
      }),
    };
    const notes = { read_note: markdown_by_id({ "1": "P".repeat(500) }) };

    const sources = await sources_of(make_service(search, notes), {
      question: "@spec",
      provider_config: provider,
      assembler_options: { ...tight_budget, token_budget: 5 },
    });

    expect(sources.sources).toEqual([]);
    expect(sources.stats.used).toBe(0);
    expect(sources.stats.retrieved).toBe(1);
  });

  it("keeps a note that is both pinned and retrieved to a single context", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([
          hit("notes/spec.md", "Spec", "1", 0.95),
          hit("notes/a.md", "A", "2", 0.9),
        ]),
      suggest_wiki_links: pinning("notes/spec.md", "Spec", "1"),
    };
    const notes = {
      read_note: markdown_by_id({ "1": "Spec body.", "2": "A body." }),
    };

    const sources = await sources_of(make_service(search, notes), {
      question: "about @spec",
      provider_config: provider,
    });

    const spec_entries = sources.sources.filter(
      (s) => s.note_path === "notes/spec.md",
    );
    expect(spec_entries.length).toBe(1);
    expect(spec_entries[0]?.pinned).toBe(true);
  });

  it("still fills eight retrieved contexts when one hit duplicates a pinned note", async () => {
    const hits = [
      hit("notes/spec.md", "Spec", "1", 0.99),
      ...Array.from({ length: 9 }, (_, i) =>
        hit(
          `notes/n${String(i)}.md`,
          `N${String(i)}`,
          `n${String(i)}`,
          0.9 - i * 0.01,
        ),
      ),
    ];
    const bodies: Record<string, string> = { "1": "Spec body." };
    for (let i = 0; i < 9; i += 1)
      bodies[`n${String(i)}`] = `Body ${String(i)}.`;

    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue(hits),
      suggest_wiki_links: pinning("notes/spec.md", "Spec", "1"),
    };

    const sources = await sources_of(
      make_service(search, { read_note: markdown_by_id(bodies) }),
      { question: "about @spec", provider_config: provider },
    );

    const unpinned = sources.sources.filter((s) => !s.pinned);
    expect(unpinned.length).toBe(8);
    expect(sources.sources.length).toBe(9);
  });

  it("caps retrieved contexts at eight and reads no more notes than that", async () => {
    const hits = Array.from({ length: 15 }, (_, i) =>
      hit(
        `notes/n${String(i)}.md`,
        `N${String(i)}`,
        `n${String(i)}`,
        0.9 - i * 0.01,
      ),
    );
    const bodies: Record<string, string> = {};
    for (let i = 0; i < 15; i += 1)
      bodies[`n${String(i)}`] = `Body ${String(i)}.`;

    const read_note = markdown_by_id(bodies);
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue(hits),
      suggest_wiki_links: no_mentions,
    };

    const sources = await sources_of(make_service(search, { read_note }), {
      question: "anything",
      provider_config: provider,
    });

    expect(sources.sources.length).toBe(8);
    expect(read_note.mock.calls.length).toBe(8);
  });

  it("honours the configured token budget instead of the module default", async () => {
    const hits = Array.from({ length: 4 }, (_, i) =>
      hit(
        `notes/n${String(i)}.md`,
        `N${String(i)}`,
        `n${String(i)}`,
        0.9 - i * 0.01,
      ),
    );
    const bodies: Record<string, string> = {};
    for (let i = 0; i < 4; i += 1) bodies[`n${String(i)}`] = "X".repeat(60);

    function run(assembler_options: Partial<typeof tight_budget>) {
      const search = {
        search_blocks: vi.fn().mockResolvedValue([]),
        hybrid_search: vi.fn().mockResolvedValue(hits),
        suggest_wiki_links: no_mentions,
      };
      return sources_of(
        make_service(search, { read_note: markdown_by_id(bodies) }),
        { question: "anything", provider_config: provider, assembler_options },
      );
    }

    const generous = await run({});
    const stingy = await run(tight_budget);

    expect(generous.sources.length).toBe(4);
    expect(stingy.sources.length).toBeLessThan(4);
  });

  it("assembles the same context however retrieval orders equally scored hits", async () => {
    const hits = [
      hit("notes/a.md", "A", "a", 0.9),
      hit("notes/b.md", "B", "b", 0.9),
      hit("notes/c.md", "C", "c", 0.9),
      hit("notes/d.md", "D", "d", 0.5),
    ];
    const bodies = {
      a: "A body.",
      b: "B body.",
      c: "C body.",
      d: "D body.",
    };

    function run(order: number[]) {
      const search = {
        search_blocks: vi.fn().mockResolvedValue([]),
        hybrid_search: vi.fn().mockResolvedValue(order.map((i) => hits[i])),
        suggest_wiki_links: pinning("notes/spec.md", "Spec", "spec"),
      };
      return sources_of(
        make_service(search, {
          read_note: markdown_by_id({ ...bodies, spec: "Spec body." }),
        }),
        { question: "about @spec", provider_config: provider },
      );
    }

    const baseline = await run([0, 1, 2, 3]);
    for (const order of [
      [3, 2, 1, 0],
      [2, 0, 3, 1],
      [1, 3, 0, 2],
    ]) {
      expect(await run(order)).toEqual(baseline);
    }
  });

  it("counts every note it read, including ones the budget dropped", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([
          hit("notes/a.md", "A", "a", 0.9),
          hit("notes/b.md", "B", "b", 0.8),
          hit("notes/c.md", "C", "c", 0.7),
        ]),
      suggest_wiki_links: no_mentions,
    };
    const notes = {
      read_note: markdown_by_id({
        a: "A".repeat(90),
        b: "B".repeat(200),
        c: "C".repeat(200),
      }),
    };

    const sources = await sources_of(make_service(search, notes), {
      question: "anything",
      provider_config: provider,
      assembler_options: tight_budget,
    });

    expect(sources.stats.retrieved).toBe(3);
    expect(sources.stats.used).toBeLessThan(3);
  });
});

describe("RagService.generate_title", () => {
  it("ignores reasoning chunks when accumulating the title", async () => {
    const stream = stream_of(
      { type: "reasoning", text: "Pondering titles" },
      { type: "text", text: "Meeting Notes" },
      { type: "done" },
    );
    const service = new RagService(
      { hybrid_search: vi.fn() } as never,
      { read_note: vi.fn() } as never,
      stream as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    const title = await service.generate_title(provider, [
      { id: "u", role: "user", content: "hi", citations: [] },
      { id: "a", role: "assistant", content: "hello", citations: [] },
    ]);

    expect(title).toBe("Meeting Notes");
  });

  // Half a title is still a plausible-looking title, which is why a stopped
  // run used to rename the chat to whatever arrived first.
  it("returns nothing when the run is stopped mid-title", async () => {
    const starter = create_aborting_run_starter([
      { type: "text", text: "Meeting" },
    ]);
    const service = new RagService(
      { hybrid_search: vi.fn() } as never,
      { read_note: vi.fn() } as never,
      starter as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    const title = await service.generate_title(provider, [
      { id: "u", role: "user", content: "hi", citations: [] },
      { id: "a", role: "assistant", content: "hello", citations: [] },
    ]);

    expect(title).toBeNull();
  });
});

describe("RagService.check_readiness", () => {
  it("reports unavailable with the reason when the status check throws", async () => {
    const search = {
      get_embedding_status: vi.fn().mockRejectedValue(new Error("db locked")),
    };
    const service = new RagService(
      search as never,
      { read_note: vi.fn() } as never,
      text_stream("x") as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    await expect(service.check_readiness()).resolves.toEqual({
      state: "unavailable",
      reason: "db locked",
    });
  });

  it("reports ready when the index is fully embedded", async () => {
    const search = {
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 3,
        embedded_notes: 3,
        model_version: "v1",
        is_embedding: false,
      }),
    };
    const service = new RagService(
      search as never,
      { read_note: vi.fn() } as never,
      text_stream("x") as never,
      make_vault_store(),
      persistence,
      tag as never,
      bases as never,
    );

    await expect(service.check_readiness()).resolves.toEqual({
      state: "ready",
    });
  });
});
