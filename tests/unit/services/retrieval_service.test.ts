import { describe, expect, it, vi } from "vitest";
import { RetrievalService } from "$lib/features/rag";
import { to_retrieval_scope } from "$lib/features/assistant";
import type { AssistantScope } from "$lib/features/assistant";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";
import type {
  BlockSectionHit,
  HybridSearchHit,
} from "$lib/shared/types/search";

const tag = { get_notes_for_tag: vi.fn().mockResolvedValue([]) };
const bases = { load_view: vi.fn(), query: vi.fn() };

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

function make_vault_store() {
  const store = new VaultStore();
  store.set_vault(create_test_vault({ path: "/vault/demo" as never }));
  return store;
}

function make_service(input: {
  search: unknown;
  notes?: unknown;
  tag?: unknown;
  bases?: unknown;
  vault_store?: VaultStore;
}) {
  return new RetrievalService(
    input.search as never,
    (input.notes ?? { read_note: vi.fn() }) as never,
    input.vault_store ?? make_vault_store(),
    (input.tag ?? tag) as never,
    (input.bases ?? bases) as never,
  );
}

function request(overrides: {
  query?: string;
  pinned_titles?: string[];
  boost_paths?: string[];
  scope?: AssistantScope;
  limit?: number;
}) {
  return {
    query: overrides.query ?? "what is it?",
    pinned_titles: overrides.pinned_titles ?? [],
    boost_paths: overrides.boost_paths ?? [],
    ...(overrides.scope ? { scope: to_retrieval_scope(overrides.scope) } : {}),
    ...(overrides.limit === undefined ? {} : { limit: overrides.limit }),
  };
}

describe("RetrievalService.retrieve", () => {
  it("retrieves the bare topic and a date window for a meta-query", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/m.md", "M", "1", 0.9)]),
    };
    const service = make_service({
      search,
      notes: {
        read_note: vi.fn().mockResolvedValue({ markdown: "Metaboloformer." }),
      },
    });

    await service.retrieve(
      request({
        query: "tell me about the notes I wrote about metaboloformer last week",
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
    const service = make_service({
      search,
      notes: { read_note: vi.fn().mockResolvedValue({ markdown: "Entry." }) },
    });

    await service.retrieve(
      request({ query: "standup notes", scope: { folders: ["journal"] } }),
    );

    expect(search.hybrid_search.mock.calls[0]?.[2]).toBe(15 * 6);
  });

  // A note scope is the narrowest filter there is, so it is the one most
  // likely to strip the whole page — it has to count as active for over-fetch.
  it("counts a note-only scope as active for over-fetch", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("journal/a.md", "A", "1", 0.9)]),
    };
    const service = make_service({
      search,
      notes: { read_note: vi.fn().mockResolvedValue({ markdown: "Entry." }) },
    });

    await service.retrieve(
      request({ query: "standup notes", scope: { notes: ["journal/a.md"] } }),
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
    const service = make_service({ search, notes });

    const outcome = await service.retrieve(
      request({ query: "is clustering significant?" }),
    );

    expect(search.get_indexed_body).toHaveBeenCalledWith(
      expect.anything(),
      linked_path,
    );
    expect(notes.read_note).not.toHaveBeenCalled();
    if (outcome.status !== "hits") throw new Error("expected hits");
    expect(outcome.retrieved[0]?.markdown).toContain("high dimensions");
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
      read_note: vi.fn().mockResolvedValue({
        markdown: "Metaboloformer is a transformer model for metabolomics.",
      }),
    };
    const service = make_service({ search, notes });

    const outcome = await service.retrieve(
      request({ query: "what is metaboloformer" }),
    );

    if (outcome.status !== "hits") throw new Error("expected hits");
    expect(outcome.retrieved.map((n) => n.note_path)).toContain(
      "notes/metaboloformer.md",
    );
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
    const service = make_service({ search, notes });

    await service.retrieve(request({ scope: { folders: ["projects"] } }));

    const read_ids = notes.read_note.mock.calls.map(
      (call: unknown[]) => call[1] as string,
    );
    expect(read_ids).toEqual(["1"]);
  });

  it("restricts retrieved sources to the exact note in a note scope", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([
          hit("projects/a.md", "A", "1", 0.9),
          hit("projects/ab.md", "AB", "2", 0.8),
          hit("archive/a.md", "A elsewhere", "3", 0.7),
        ]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const service = make_service({ search, notes });

    await service.retrieve(request({ scope: { notes: ["projects/a.md"] } }));

    const read_ids = notes.read_note.mock.calls.map(
      (call: unknown[]) => call[1] as string,
    );
    expect(read_ids).toEqual(["1"]);
  });

  // The difference between a note scope and a folder scope: a folder is a
  // prefix, a note is not. "projects/a.md" must not admit "projects/ab.md".
  it("does not let a note scope match a longer path that starts with it", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("projects/ab.md", "AB", "2", 0.8)]),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const service = make_service({ search, notes });

    const outcome = await service.retrieve(
      request({ query: "q", scope: { notes: ["projects/a"] } }),
    );

    expect(outcome).toEqual({ status: "scope_filtered" });
    expect(notes.read_note).not.toHaveBeenCalled();
  });

  it("reports scope_filtered when the scoped note is not among the hits", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("archive/b.md", "B", "2", 0.8)]),
    };
    const service = make_service({ search });

    const outcome = await service.retrieve(
      request({ query: "q", scope: { notes: ["projects/a.md"] } }),
    );

    expect(outcome).toEqual({ status: "scope_filtered" });
  });

  it("intersects a note scope with a folder scope rather than widening", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("archive/a.md", "A", "1", 0.9)]),
    };
    const service = make_service({ search });

    const outcome = await service.retrieve(
      request({
        query: "q",
        scope: { notes: ["archive/a.md"], folders: ["projects"] },
      }),
    );

    expect(outcome).toEqual({ status: "scope_filtered" });
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
    const service = make_service({ search, notes, tag: tag_port });

    await service.retrieve(request({ scope: { tags: ["#active"] } }));

    expect(tag_port.get_notes_for_tag).toHaveBeenCalledWith(
      expect.anything(),
      "active",
    );
    const read_ids = notes.read_note.mock.calls.map(
      (call: unknown[]) => call[1] as string,
    );
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
    const service = make_service({ search, notes, bases: bases_port });

    await service.retrieve(
      request({ scope: { bases: ["views/active.base"] } }),
    );

    expect(bases_port.load_view).toHaveBeenCalledWith(
      expect.anything(),
      "views/active.base",
    );
    const read_ids = notes.read_note.mock.calls.map(
      (call: unknown[]) => call[1] as string,
    );
    expect(read_ids).toEqual(["1"]);
  });

  it("raises the base query limit so a small saved-view page size cannot truncate the note-set", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("projects/a.md", "A", "1", 0.9)]),
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
    const service = make_service({
      search,
      notes: { read_note: vi.fn().mockResolvedValue({ markdown: "Body." }) },
      bases: bases_port,
    });

    await service.retrieve(
      request({ scope: { bases: ["views/active.base"] } }),
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
    const service = make_service({ search, notes });

    await service.retrieve(
      request({ scope: { folders: ["projects", "archive"] } }),
    );

    const read_ids = notes.read_note.mock.calls.map(
      (call: unknown[]) => call[1] as string,
    );
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
    const service = make_service({ search, notes, tag: tag_port });

    await service.retrieve(
      request({ scope: { folders: ["projects"], tags: ["active"] } }),
    );

    const read_ids = notes.read_note.mock.calls.map(
      (call: unknown[]) => call[1] as string,
    );
    expect(read_ids).toEqual(["2"]);
  });

  it("never calls scope ports when scope arrays are empty", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("projects/a.md", "A", "1", 0.9)]),
    };
    const tag_port = { get_notes_for_tag: vi.fn() };
    const bases_port = { load_view: vi.fn(), query: vi.fn() };
    const service = make_service({
      search,
      notes: { read_note: vi.fn().mockResolvedValue({ markdown: "Body." }) },
      tag: tag_port,
      bases: bases_port,
    });

    await service.retrieve(
      request({ scope: { folders: [], tags: [], bases: [] } }),
    );

    expect(tag_port.get_notes_for_tag).not.toHaveBeenCalled();
    expect(bases_port.load_view).not.toHaveBeenCalled();
    expect(bases_port.query).not.toHaveBeenCalled();
  });

  it("reports scope_failed and reads nothing when a base view fails to load", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("projects/a.md", "A", "1", 0.9)]),
    };
    const notes = { read_note: vi.fn() };
    const bases_port = {
      load_view: vi.fn().mockRejectedValue(new Error("missing view")),
      query: vi.fn(),
    };
    const service = make_service({ search, notes, bases: bases_port });

    const outcome = await service.retrieve(
      request({ scope: { bases: ["views/missing.base"] } }),
    );

    expect(outcome).toEqual({ status: "scope_failed", scope_label: "base" });
    expect(notes.read_note).not.toHaveBeenCalled();
  });

  it("reports scope_failed rather than widening when a tag scope lookup throws", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("projects/a.md", "A", "1", 0.9)]),
    };
    const notes = { read_note: vi.fn() };
    const tag_port = {
      get_notes_for_tag: vi.fn().mockRejectedValue(new Error("index down")),
    };
    const service = make_service({ search, notes, tag: tag_port });

    const outcome = await service.retrieve(
      request({ scope: { tags: ["#active"] } }),
    );

    expect(outcome).toEqual({ status: "scope_failed", scope_label: "tag" });
    expect(notes.read_note).not.toHaveBeenCalled();
  });

  it("reports scope_filtered when raw retrieval had hits but the scope removed them all", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("archive/b.md", "B", "2", 0.8)]),
    };
    const notes = { read_note: vi.fn() };
    const service = make_service({ search, notes });

    const outcome = await service.retrieve(
      request({ query: "q", scope: { folders: ["projects"] } }),
    );

    expect(outcome).toEqual({ status: "scope_filtered" });
    expect(notes.read_note).not.toHaveBeenCalled();
  });

  it("reports empty when a scoped retrieval had no raw hits at all", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
    };
    const service = make_service({ search });

    const outcome = await service.retrieve(
      request({ query: "q", scope: { folders: ["projects"] } }),
    );

    expect(outcome).toEqual({ status: "empty" });
  });

  it("reports search_failed when retrieval throws", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockRejectedValue(new Error("index offline")),
    };
    const service = make_service({ search });

    const outcome = await service.retrieve(request({ query: "q" }));

    expect(outcome).toEqual({ status: "search_failed" });
  });

  it("reports no_vault when there is no active vault", async () => {
    const service = make_service({
      search: { search_blocks: vi.fn(), hybrid_search: vi.fn() },
      vault_store: new VaultStore(),
    });

    const outcome = await service.retrieve(request({ query: "q" }));

    expect(outcome).toEqual({ status: "no_vault" });
  });

  it("drops a note that cannot be read rather than returning it empty", async () => {
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi
        .fn()
        .mockResolvedValue([hit("notes/a.md", "A", "1", 0.9)]),
    };
    const notes = {
      read_note: vi.fn().mockRejectedValue(new Error("gone")),
    };
    const service = make_service({ search, notes });

    const outcome = await service.retrieve(request({ query: "q" }));

    if (outcome.status !== "hits") throw new Error("expected hits");
    expect(outcome.pinned).toEqual([]);
    expect(outcome.retrieved).toEqual([]);
  });

  it("reads no more than eight retrieved notes however many hits come back", async () => {
    const hits = Array.from({ length: 20 }, (_, i) =>
      hit(`notes/n${String(i)}.md`, `N${String(i)}`, String(i), 1 - i / 100),
    );
    const search = {
      search_blocks: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue(hits),
    };
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };
    const service = make_service({ search, notes });

    const outcome = await service.retrieve(request({ query: "q" }));

    expect(notes.read_note).toHaveBeenCalledTimes(8);
    if (outcome.status !== "hits") throw new Error("expected hits");
    expect(outcome.retrieved).toHaveLength(8);
  });

  it("assigns the same retrieved ids however search orders equally scored hits", async () => {
    const a = hit("notes/a.md", "A", "1", 0.5);
    const b = hit("notes/b.md", "B", "2", 0.5);
    const notes = {
      read_note: vi.fn().mockResolvedValue({ markdown: "Body." }),
    };

    async function ids_for(order: HybridSearchHit[]) {
      const service = make_service({
        search: {
          search_blocks: vi.fn().mockResolvedValue([]),
          hybrid_search: vi.fn().mockResolvedValue(order),
        },
        notes,
      });
      const outcome = await service.retrieve(request({ query: "q" }));
      if (outcome.status !== "hits") throw new Error("expected hits");
      return outcome.retrieved.map((n) => n.id);
    }

    expect(await ids_for([a, b])).toEqual(await ids_for([b, a]));
  });
});

describe("RetrievalService.check_readiness", () => {
  it("reports unavailable with the reason when the status check throws", async () => {
    const service = make_service({
      search: {
        get_embedding_status: vi.fn().mockRejectedValue(new Error("boom")),
      },
    });

    await expect(service.check_readiness()).resolves.toEqual({
      state: "unavailable",
      reason: "boom",
    });
  });

  it("reports ready when the index is fully embedded", async () => {
    const service = make_service({
      search: {
        get_embedding_status: vi.fn().mockResolvedValue({
          total_notes: 5,
          embedded_notes: 5,
          model_version: "v1",
          is_embedding: false,
        }),
      },
    });

    await expect(service.check_readiness()).resolves.toEqual({
      state: "ready",
    });
  });
});
