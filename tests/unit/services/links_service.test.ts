import { describe, expect, it, vi } from "vitest";
import { LinksService } from "$lib/features/links/application/links_service";
import { LinksStore } from "$lib/features/links/state/links_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
import type { NoteMeta } from "$lib/shared/types/note";
import type { OrphanLink, SemanticSearchHit } from "$lib/shared/types/search";

function note(path: string): NoteMeta {
  return {
    id: as_note_path(path),
    path: as_note_path(path),
    name: path.split("/").pop()?.replace(".md", "") ?? "",
    title: path.split("/").pop()?.replace(".md", "") ?? "",
    mtime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function orphan(target_path: string, ref_count = 1): OrphanLink {
  return { target_path, ref_count };
}

function local_snapshot() {
  return {
    outlink_paths: ["docs/target.md"],
    external_links: [{ url: "https://example.com", text: "site" }],
  };
}

function create_deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("LinksService", () => {
  it("loads note links snapshot from port", async () => {
    const snapshot = {
      backlinks: [note("a.md")],
      outlinks: [note("b.md")],
      orphan_links: [orphan("missing/c.md")],
    };
    const search_port = {
      search_notes: vi.fn().mockResolvedValue([]),
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue(snapshot),
      extract_local_note_links: vi.fn().mockResolvedValue(local_snapshot()),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
      semantic_search: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();

    const service = new LinksService(search_port, vault_store, links_store);
    await service.load_note_links("target.md");

    expect(search_port.get_note_links_snapshot).toHaveBeenCalledWith(
      "vault-1",
      "target.md",
    );
    expect(links_store.active_note_path).toBe("target.md");
    expect(links_store.global_status).toBe("ready");
    expect(links_store.backlinks).toEqual(snapshot.backlinks);
    expect(links_store.outlinks).toEqual(snapshot.outlinks);
    expect(links_store.orphan_links).toEqual(snapshot.orphan_links);
  });

  it("clears state when no vault is selected", async () => {
    const search_port = {
      search_notes: vi.fn(),
      suggest_wiki_links: vi.fn(),
      suggest_planned_links: vi.fn(),
      get_note_links_snapshot: vi.fn(),
      extract_local_note_links: vi.fn().mockResolvedValue(local_snapshot()),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
      semantic_search: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const vault_store = new VaultStore();
    const links_store = new LinksStore();
    links_store.set_snapshot("old.md", {
      backlinks: [note("x.md")],
      outlinks: [note("y.md")],
      orphan_links: [orphan("missing/z.md")],
    });

    const service = new LinksService(search_port, vault_store, links_store);
    await service.load_note_links("target.md");

    expect(search_port.get_note_links_snapshot).not.toHaveBeenCalled();
    expect(links_store.active_note_path).toBeNull();
    expect(links_store.global_status).toBe("idle");
    expect(links_store.backlinks).toEqual([]);
    expect(links_store.outlinks).toEqual([]);
    expect(links_store.orphan_links).toEqual([]);
  });

  it("ignores stale out-of-order responses", async () => {
    const first = create_deferred<{
      backlinks: NoteMeta[];
      outlinks: NoteMeta[];
      orphan_links: OrphanLink[];
    }>();
    const second = create_deferred<{
      backlinks: NoteMeta[];
      outlinks: NoteMeta[];
      orphan_links: OrphanLink[];
    }>();
    let call_count = 0;

    const search_port = {
      search_notes: vi.fn(),
      suggest_wiki_links: vi.fn(),
      suggest_planned_links: vi.fn(),
      get_note_links_snapshot: vi.fn().mockImplementation(() => {
        call_count += 1;
        return call_count === 1 ? first.promise : second.promise;
      }),
      extract_local_note_links: vi.fn().mockResolvedValue(local_snapshot()),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
      semantic_search: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(search_port, vault_store, links_store);

    const first_load = service.load_note_links("a.md");
    const second_load = service.load_note_links("b.md");

    second.resolve({
      backlinks: [note("b/back.md")],
      outlinks: [note("b/out.md")],
      orphan_links: [orphan("b/missing.md")],
    });
    await second_load;

    first.resolve({
      backlinks: [note("a/back.md")],
      outlinks: [note("a/out.md")],
      orphan_links: [orphan("a/missing.md")],
    });
    await first_load;

    expect(links_store.active_note_path).toBe("b.md");
    expect(links_store.global_status).toBe("ready");
    expect(links_store.backlinks.map((entry) => entry.path)).toEqual([
      "b/back.md",
    ]);
    expect(links_store.outlinks.map((entry) => entry.path)).toEqual([
      "b/out.md",
    ]);
    expect(links_store.orphan_links).toEqual([orphan("b/missing.md")]);
  });

  it("invalidates in-flight loads on clear()", async () => {
    const deferred = create_deferred<{
      backlinks: NoteMeta[];
      outlinks: NoteMeta[];
      orphan_links: OrphanLink[];
    }>();
    const search_port = {
      search_notes: vi.fn(),
      suggest_wiki_links: vi.fn(),
      suggest_planned_links: vi.fn(),
      get_note_links_snapshot: vi.fn().mockReturnValue(deferred.promise),
      extract_local_note_links: vi.fn().mockResolvedValue(local_snapshot()),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
      semantic_search: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(search_port, vault_store, links_store);

    const inflight = service.load_note_links("target.md");
    service.clear();

    deferred.resolve({
      backlinks: [note("x.md")],
      outlinks: [note("y.md")],
      orphan_links: [orphan("missing/z.md")],
    });
    await inflight;

    expect(links_store.active_note_path).toBeNull();
    expect(links_store.global_status).toBe("idle");
    expect(links_store.backlinks).toEqual([]);
    expect(links_store.outlinks).toEqual([]);
    expect(links_store.orphan_links).toEqual([]);
  });

  it("updates local links snapshot with memoized markdown checks", async () => {
    const extract_local_note_links = vi
      .fn()
      .mockResolvedValue(local_snapshot());
    const search_port = {
      search_notes: vi.fn(),
      suggest_wiki_links: vi.fn(),
      suggest_planned_links: vi.fn(),
      get_note_links_snapshot: vi.fn(),
      extract_local_note_links,
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
      semantic_search: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(search_port, vault_store, links_store);
    const markdown = "[[target]] [site](https://example.com)";

    await service.update_local_note_links("docs/a.md", markdown);

    expect(links_store.local_outlink_paths).toEqual(["docs/target.md"]);
    expect(links_store.external_links).toEqual([
      { url: "https://example.com", text: "site" },
    ]);
    expect(extract_local_note_links).toHaveBeenCalledTimes(1);

    await service.update_local_note_links("docs/a.md", markdown);
    expect(extract_local_note_links).toHaveBeenCalledTimes(1);
  });

  it("ignores stale local extraction responses", async () => {
    const first = create_deferred<{
      outlink_paths: string[];
      external_links: Array<{ url: string; text: string }>;
    }>();
    const second = create_deferred<{
      outlink_paths: string[];
      external_links: Array<{ url: string; text: string }>;
    }>();

    const extract_local_note_links = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const search_port = {
      search_notes: vi.fn(),
      suggest_wiki_links: vi.fn(),
      suggest_planned_links: vi.fn(),
      get_note_links_snapshot: vi.fn(),
      extract_local_note_links,
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
      semantic_search: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(search_port, vault_store, links_store);

    const first_load = service.update_local_note_links("docs/a.md", "first");
    const second_load = service.update_local_note_links("docs/a.md", "second");

    second.resolve({
      outlink_paths: ["docs/new.md"],
      external_links: [{ url: "https://new.example.com", text: "new" }],
    });
    await second_load;

    first.resolve({
      outlink_paths: ["docs/old.md"],
      external_links: [{ url: "https://old.example.com", text: "old" }],
    });
    await first_load;

    expect(links_store.local_outlink_paths).toEqual(["docs/new.md"]);
    expect(links_store.external_links).toEqual([
      { url: "https://new.example.com", text: "new" },
    ]);
  });
});

function make_search_port(
  overrides: Partial<{ find_similar_notes: ReturnType<typeof vi.fn> }> = {},
) {
  return {
    search_notes: vi.fn().mockResolvedValue([]),
    suggest_wiki_links: vi.fn().mockResolvedValue([]),
    suggest_planned_links: vi.fn().mockResolvedValue([]),
    get_note_links_snapshot: vi.fn().mockResolvedValue({
      backlinks: [],
      outlinks: [],
      orphan_links: [],
    }),
    extract_local_note_links: vi.fn().mockResolvedValue(local_snapshot()),
    rewrite_note_links: vi
      .fn()
      .mockImplementation((markdown: string) =>
        Promise.resolve({ markdown, changed: false }),
      ),
    resolve_note_link: vi.fn().mockResolvedValue(null),
    resolve_wiki_link: vi.fn().mockResolvedValue(null),
    semantic_search: vi.fn().mockResolvedValue([]),
    hybrid_search: vi.fn().mockResolvedValue([]),
    get_embedding_status: vi.fn().mockResolvedValue({
      total_notes: 0,
      embedded_notes: 0,
      model_version: "unavailable",
      is_embedding: false,
    }),
    find_similar_notes: vi.fn().mockResolvedValue([]),
    semantic_search_batch: vi.fn().mockResolvedValue([]),
    rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("LinksService.load_suggested_links", () => {
  it("maps hits to suggested links with similarity = 1 - distance", async () => {
    const hits: SemanticSearchHit[] = [
      { note: note("a.md"), distance: 0.2 },
      { note: note("b.md"), distance: 0.4 },
    ];
    const search_port = make_search_port({
      find_similar_notes: vi.fn().mockResolvedValue(hits),
    });

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(search_port, vault_store, links_store);

    await service.load_suggested_links("note.md");

    expect(search_port.find_similar_notes).toHaveBeenCalledWith(
      "vault-1",
      "note.md",
      5,
      true,
    );
    expect(links_store.suggested_links).toHaveLength(2);
    expect(links_store.suggested_links[0]?.note).toEqual(note("a.md"));
    expect(links_store.suggested_links[0]?.similarity).toBeCloseTo(0.8, 5);
    expect(links_store.suggested_links[1]?.note).toEqual(note("b.md"));
    expect(links_store.suggested_links[1]?.similarity).toBeCloseTo(0.6, 5);
    expect(links_store.suggested_links_loading).toBe(false);
  });

  it("filters out hits with similarity <= 0.5", async () => {
    const hits: SemanticSearchHit[] = [
      { note: note("close.md"), distance: 0.3 },
      { note: note("border.md"), distance: 0.5 },
      { note: note("far.md"), distance: 0.7 },
    ];
    const search_port = make_search_port({
      find_similar_notes: vi.fn().mockResolvedValue(hits),
    });

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(search_port, vault_store, links_store);

    await service.load_suggested_links("note.md");

    expect(links_store.suggested_links).toHaveLength(1);
    expect(links_store.suggested_links[0]?.note.path).toBe("close.md");
  });

  it("clears suggested links when no vault is selected", async () => {
    const search_port = make_search_port();
    const vault_store = new VaultStore();
    const links_store = new LinksStore();
    const service = new LinksService(search_port, vault_store, links_store);

    await service.load_suggested_links("note.md");

    expect(search_port.find_similar_notes).not.toHaveBeenCalled();
    expect(links_store.suggested_links).toEqual([]);
    expect(links_store.suggested_links_loading).toBe(false);
  });

  it("clears suggested links and ignores error when port throws", async () => {
    const search_port = make_search_port({
      find_similar_notes: vi.fn().mockRejectedValue(new Error("unavailable")),
    });

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(search_port, vault_store, links_store);

    await service.load_suggested_links("note.md");

    expect(links_store.suggested_links).toEqual([]);
    expect(links_store.suggested_links_loading).toBe(false);
    expect(links_store.suggested_links_note_path).toBeNull();
  });

  it("ignores stale response when note changes mid-flight", async () => {
    const first = create_deferred<SemanticSearchHit[]>();
    const second = create_deferred<SemanticSearchHit[]>();
    let call_count = 0;

    const search_port = make_search_port({
      find_similar_notes: vi.fn().mockImplementation(() => {
        call_count += 1;
        return call_count === 1 ? first.promise : second.promise;
      }),
    });

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(search_port, vault_store, links_store);

    const first_load = service.load_suggested_links("a.md");
    const second_load = service.load_suggested_links("b.md");

    second.resolve([{ note: note("b-similar.md"), distance: 0.1 }]);
    await second_load;

    first.resolve([{ note: note("a-similar.md"), distance: 0.1 }]);
    await first_load;

    expect(links_store.suggested_links_note_path).toBe("b.md");
    expect(links_store.suggested_links).toHaveLength(1);
    expect(links_store.suggested_links[0]?.note.path).toBe("b-similar.md");
  });
});
