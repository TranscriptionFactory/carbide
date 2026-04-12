import { describe, expect, it, vi } from "vitest";
import { LinksService } from "$lib/features/links/application/links_service";
import { LinksStore } from "$lib/features/links/state/links_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
import type { NoteMeta } from "$lib/shared/types/note";
import type { OrphanLink, SemanticSearchHit } from "$lib/shared/types/search";
import type { MarkdownLspPort } from "$lib/features/markdown_lsp";
import type { MarkdownLspStore } from "$lib/features/markdown_lsp";

function make_markdown_lsp_port(
  overrides: Partial<MarkdownLspPort> = {},
): MarkdownLspPort {
  return {
    start: vi.fn().mockResolvedValue({
      completion_trigger_characters: [],
      effective_provider: "marksman",
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    did_open: vi.fn().mockResolvedValue(undefined),
    did_change: vi.fn().mockResolvedValue(undefined),
    did_save: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue({ contents: null }),
    references: vi.fn().mockResolvedValue([]),
    definition: vi.fn().mockResolvedValue([]),
    code_actions: vi.fn().mockResolvedValue([]),
    code_action_resolve: vi.fn().mockResolvedValue({
      files_created: [],
      files_deleted: [],
      files_modified: [],
      errors: [],
    }),
    workspace_symbols: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue({
      files_created: [],
      files_deleted: [],
      files_modified: [],
      errors: [],
    }),
    prepare_rename: vi.fn().mockResolvedValue(null),
    completion: vi.fn().mockResolvedValue([]),
    formatting: vi.fn().mockResolvedValue([]),
    inlay_hints: vi.fn().mockResolvedValue([]),
    document_symbols: vi.fn().mockResolvedValue([]),
    subscribe_diagnostics: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  } as MarkdownLspPort;
}

function make_markdown_lsp_store(status = "running"): MarkdownLspStore {
  return { status } as MarkdownLspStore;
}

function note(path: string): NoteMeta {
  return {
    id: as_note_path(path),
    path: as_note_path(path),
    name: path.split("/").pop()?.replace(".md", "") ?? "",
    title: path.split("/").pop()?.replace(".md", "") ?? "",
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
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
  it("loads backlinks from Marksman references", async () => {
    const vault = create_test_vault();
    const markdown_lsp_port = make_markdown_lsp_port({
      references: vi.fn().mockResolvedValue([
        {
          uri: `file://${vault.path}/a.md`,
          range: {
            start_line: 0,
            start_character: 0,
            end_line: 0,
            end_character: 5,
          },
        },
        {
          uri: `file://${vault.path}/b.md`,
          range: {
            start_line: 2,
            start_character: 0,
            end_line: 2,
            end_character: 5,
          },
        },
      ]),
    });

    const search_port = make_search_port();
    const vault_store = new VaultStore();
    vault_store.set_vault(vault);
    const links_store = new LinksStore();

    const service = new LinksService(
      search_port,
      vault_store,
      links_store,
      markdown_lsp_port,
      make_markdown_lsp_store(),
    );
    await service.load_note_links("target.md");

    expect(markdown_lsp_port.references).toHaveBeenCalledWith(
      "vault-1",
      "target.md",
      0,
      0,
    );
    expect(links_store.active_note_path).toBe("target.md");
    expect(links_store.global_status).toBe("ready");
    expect(links_store.backlinks.map((b) => b.path)).toEqual(["a.md", "b.md"]);
  });

  it("clears state when no vault is selected", async () => {
    const vault_store = new VaultStore();
    const links_store = new LinksStore();
    links_store.set_snapshot("old.md", {
      backlinks: [note("x.md")],
      outlinks: [note("y.md")],
      orphan_links: [orphan("missing/z.md")],
    });

    const markdown_lsp_port = make_markdown_lsp_port();
    const service = new LinksService(
      make_search_port(),
      vault_store,
      links_store,
      markdown_lsp_port,
      make_markdown_lsp_store(),
    );
    await service.load_note_links("target.md");

    expect(markdown_lsp_port.references).not.toHaveBeenCalled();
    expect(links_store.active_note_path).toBeNull();
    expect(links_store.global_status).toBe("idle");
    expect(links_store.backlinks).toEqual([]);
    expect(links_store.outlinks).toEqual([]);
    expect(links_store.orphan_links).toEqual([]);
  });

  it("ignores stale out-of-order Marksman responses", async () => {
    const first = create_deferred<
      Array<{
        uri: string;
        range: {
          start_line: number;
          start_character: number;
          end_line: number;
          end_character: number;
        };
      }>
    >();
    const second = create_deferred<
      Array<{
        uri: string;
        range: {
          start_line: number;
          start_character: number;
          end_line: number;
          end_character: number;
        };
      }>
    >();
    let call_count = 0;

    const vault = create_test_vault();
    const markdown_lsp_port = make_markdown_lsp_port({
      references: vi.fn().mockImplementation(() => {
        call_count += 1;
        return call_count === 1 ? first.promise : second.promise;
      }),
    });

    const vault_store = new VaultStore();
    vault_store.set_vault(vault);
    const links_store = new LinksStore();
    const service = new LinksService(
      make_search_port(),
      vault_store,
      links_store,
      markdown_lsp_port,
      make_markdown_lsp_store(),
    );

    const first_load = service.load_note_links("a.md");
    const second_load = service.load_note_links("b.md");

    const range = {
      start_line: 0,
      start_character: 0,
      end_line: 0,
      end_character: 5,
    };
    second.resolve([{ uri: `file://${vault.path}/b-ref.md`, range }]);
    await second_load;

    first.resolve([{ uri: `file://${vault.path}/a-ref.md`, range }]);
    await first_load;

    expect(links_store.active_note_path).toBe("b.md");
    expect(links_store.global_status).toBe("ready");
    expect(links_store.backlinks.map((b) => b.path)).toEqual(["b-ref.md"]);
  });

  it("invalidates in-flight loads on clear()", async () => {
    const deferred = create_deferred<
      Array<{
        uri: string;
        range: {
          start_line: number;
          start_character: number;
          end_line: number;
          end_character: number;
        };
      }>
    >();
    const vault = create_test_vault();
    const markdown_lsp_port = make_markdown_lsp_port({
      references: vi.fn().mockReturnValue(deferred.promise),
    });

    const vault_store = new VaultStore();
    vault_store.set_vault(vault);
    const links_store = new LinksStore();
    const service = new LinksService(
      make_search_port(),
      vault_store,
      links_store,
      markdown_lsp_port,
      make_markdown_lsp_store(),
    );

    const inflight = service.load_note_links("target.md");
    service.clear();

    const range = {
      start_line: 0,
      start_character: 0,
      end_line: 0,
      end_character: 5,
    };
    deferred.resolve([{ uri: `file://${vault.path}/x.md`, range }]);
    await inflight;

    expect(links_store.active_note_path).toBeNull();
    expect(links_store.global_status).toBe("idle");
    expect(links_store.backlinks).toEqual([]);
  });

  it("extracts local links from markdown using frontend mdast traversal", () => {
    const search_port = make_search_port();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(
      search_port,
      vault_store,
      links_store,
      make_markdown_lsp_port(),
      make_markdown_lsp_store(),
    );
    const markdown = "[[target]] [site](https://example.com)";

    service.update_local_note_links("docs/a.md", markdown);

    expect(links_store.local_outlink_paths).toContain("target");
    expect(links_store.external_links).toEqual([
      { url: "https://example.com", text: "site" },
    ]);
  });

  it("memoizes local link extraction for identical markdown", () => {
    const search_port = make_search_port();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(
      search_port,
      vault_store,
      links_store,
      make_markdown_lsp_port(),
      make_markdown_lsp_store(),
    );
    const markdown = "[[target]] [site](https://example.com)";

    service.update_local_note_links("docs/a.md", markdown);
    const first_outlinks = [...links_store.local_outlink_paths];

    service.update_local_note_links("docs/a.md", markdown);

    expect(links_store.local_outlink_paths).toEqual(first_outlinks);
  });

  it("updates local links when markdown changes", () => {
    const search_port = make_search_port();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(
      search_port,
      vault_store,
      links_store,
      make_markdown_lsp_port(),
      make_markdown_lsp_store(),
    );

    service.update_local_note_links("docs/a.md", "[[first]]");
    expect(links_store.local_outlink_paths).toContain("first");

    service.update_local_note_links("docs/a.md", "[[second]]");
    expect(links_store.local_outlink_paths).toContain("second");
    expect(links_store.local_outlink_paths).not.toContain("first");
  });
});

function make_search_port(
  overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {},
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
    get_note_stats: vi.fn().mockResolvedValue({}),
    get_file_cache: vi.fn().mockResolvedValue({}),
    load_smart_link_rules: vi.fn().mockResolvedValue([]),
    save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
    compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
    compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("LinksService.load_suggested_links", () => {
  it("maps semantic hits to suggested links with provenance", async () => {
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
    const service = new LinksService(
      search_port,
      vault_store,
      links_store,
      make_markdown_lsp_port(),
      make_markdown_lsp_store(),
    );

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
    expect(links_store.suggested_links[0]?.rules).toEqual([
      { ruleId: "semantic_similarity", rawScore: expect.closeTo(0.8, 5) },
    ]);
    expect(links_store.suggested_links[1]?.similarity).toBeCloseTo(0.6, 5);
    expect(links_store.suggested_links_loading).toBe(false);
  });

  it("filters out semantic hits with similarity <= threshold", async () => {
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
    const service = new LinksService(
      search_port,
      vault_store,
      links_store,
      make_markdown_lsp_port(),
      make_markdown_lsp_store(),
    );

    await service.load_suggested_links("note.md");

    expect(links_store.suggested_links).toHaveLength(1);
    expect(links_store.suggested_links[0]?.note.path).toBe("close.md");
  });

  it("merges smart link suggestions with semantic hits", async () => {
    const semantic_hits: SemanticSearchHit[] = [
      { note: note("shared.md"), distance: 0.3 },
    ];
    const smart_suggestions = [
      {
        targetPath: "shared.md",
        targetTitle: "Shared",
        score: 0.5,
        rules: [{ ruleId: "shared_tag", rawScore: 0.5 }],
      },
      {
        targetPath: "smart-only.md",
        targetTitle: "Smart Only",
        score: 0.4,
        rules: [{ ruleId: "same_day", rawScore: 0.4 }],
      },
    ];
    const search_port = make_search_port({
      find_similar_notes: vi.fn().mockResolvedValue(semantic_hits),
      compute_smart_link_suggestions: vi
        .fn()
        .mockResolvedValue(smart_suggestions),
    });

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(
      search_port,
      vault_store,
      links_store,
      make_markdown_lsp_port(),
      make_markdown_lsp_store(),
    );

    await service.load_suggested_links("note.md");

    expect(links_store.suggested_links).toHaveLength(2);
    const shared = links_store.suggested_links.find(
      (s) => s.note.path === "shared.md",
    );
    expect(shared?.similarity).toBeCloseTo(0.7, 5);
    expect(shared?.rules).toHaveLength(2);
    const smart_only = links_store.suggested_links.find(
      (s) => s.note.path === "smart-only.md",
    );
    expect(smart_only?.rules).toEqual([{ ruleId: "same_day", rawScore: 0.4 }]);
  });

  it("returns smart-only results when semantic fails", async () => {
    const smart_suggestions = [
      {
        targetPath: "tagged.md",
        targetTitle: "Tagged",
        score: 0.6,
        rules: [{ ruleId: "shared_tag", rawScore: 0.6 }],
      },
    ];
    const search_port = make_search_port({
      find_similar_notes: vi.fn().mockRejectedValue(new Error("no embeddings")),
      compute_smart_link_suggestions: vi
        .fn()
        .mockResolvedValue(smart_suggestions),
    });

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(
      search_port,
      vault_store,
      links_store,
      make_markdown_lsp_port(),
      make_markdown_lsp_store(),
    );

    await service.load_suggested_links("note.md");

    expect(links_store.suggested_links).toHaveLength(1);
    expect(links_store.suggested_links[0]?.note.path).toBe("tagged.md");
  });

  it("clears suggested links when no vault is selected", async () => {
    const search_port = make_search_port();
    const vault_store = new VaultStore();
    const links_store = new LinksStore();
    const service = new LinksService(
      search_port,
      vault_store,
      links_store,
      make_markdown_lsp_port(),
      make_markdown_lsp_store(),
    );

    await service.load_suggested_links("note.md");

    expect(search_port.find_similar_notes).not.toHaveBeenCalled();
    expect(links_store.suggested_links).toEqual([]);
    expect(links_store.suggested_links_loading).toBe(false);
  });

  it("returns empty when both sources fail", async () => {
    const search_port = make_search_port({
      find_similar_notes: vi.fn().mockRejectedValue(new Error("unavailable")),
      compute_smart_link_suggestions: vi
        .fn()
        .mockRejectedValue(new Error("unavailable")),
    });

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(
      search_port,
      vault_store,
      links_store,
      make_markdown_lsp_port(),
      make_markdown_lsp_store(),
    );

    await service.load_suggested_links("note.md");

    expect(links_store.suggested_links).toEqual([]);
    expect(links_store.suggested_links_loading).toBe(false);
  });

  it("ignores stale response when note changes mid-flight", async () => {
    const first_semantic = create_deferred<SemanticSearchHit[]>();
    const second_semantic = create_deferred<SemanticSearchHit[]>();
    let call_count = 0;

    const search_port = make_search_port({
      find_similar_notes: vi.fn().mockImplementation(() => {
        call_count += 1;
        return call_count === 1
          ? first_semantic.promise
          : second_semantic.promise;
      }),
    });

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const links_store = new LinksStore();
    const service = new LinksService(
      search_port,
      vault_store,
      links_store,
      make_markdown_lsp_port(),
      make_markdown_lsp_store(),
    );

    const first_load = service.load_suggested_links("a.md");
    const second_load = service.load_suggested_links("b.md");

    second_semantic.resolve([{ note: note("b-similar.md"), distance: 0.1 }]);
    await second_load;

    first_semantic.resolve([{ note: note("a-similar.md"), distance: 0.1 }]);
    await first_load;

    expect(links_store.suggested_links_note_path).toBe("b.md");
    expect(links_store.suggested_links).toHaveLength(1);
    expect(links_store.suggested_links[0]?.note.path).toBe("b-similar.md");
  });
});
