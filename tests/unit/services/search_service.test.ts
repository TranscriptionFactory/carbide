import { describe, expect, it, vi } from "vitest";
import { SearchService } from "$lib/features/search/application/search_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import {
  as_note_path,
  as_vault_id,
  as_vault_path,
} from "$lib/shared/types/ids";
import type {
  PlannedLinkSuggestion,
  WikiSuggestion,
} from "$lib/shared/types/search";
import { create_test_vault } from "../helpers/test_fixtures";
import { create_mock_index_port } from "../helpers/mock_ports";

function create_deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function existing(path: string, score = 1): WikiSuggestion {
  return {
    kind: "existing",
    note: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.split("/").at(-1)?.replace(".md", "") ?? "",
      title: path.split("/").at(-1)?.replace(".md", "") ?? "",
      mtime_ms: 0,
      size_bytes: 0,
    },
    score,
  };
}

function planned(
  target_path: string,
  ref_count: number,
): PlannedLinkSuggestion {
  return { target_path, ref_count };
}

describe("SearchService", () => {
  it("searches notes and returns results", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([
        {
          note: {
            id: as_note_path("docs/a.md"),
            path: as_note_path("docs/a.md"),
            name: "a",
            title: "a",
            mtime_ms: 0,
            size_bytes: 0,
          },
          score: 1,
          snippet: "match",
        },
      ]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());

    const op_store = new OpStore();

    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    const result = await service.search_notes("alpha");

    expect(search_port.search_notes).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.results.length).toBe(1);
    }
    expect(op_store.get("search.notes").status).toBe("success");
  });

  it("returns empty result and resets op for empty query", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
    };

    const vault_store = new VaultStore();
    const op_store = new OpStore();

    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    op_store.start("search.notes", 123);
    const result = await service.search_notes("  ");

    expect(result).toEqual({
      status: "empty",
      results: [],
    });
    expect(search_port.search_notes).not.toHaveBeenCalled();
    expect(op_store.get("search.notes").status).toBe("idle");
  });

  it("finds the editor width setting in settings search", () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
    };

    const service = new SearchService(
      search_port,
      new VaultStore(),
      new OpStore(),
      () => 1,
    );

    const results = service.search_settings("width");

    expect(
      results.some(
        (result) =>
          result.kind === "setting" &&
          result.setting.key === "editor_max_width_ch",
      ),
    ).toBe(true);
  });

  it("filters disabled commands from command search", () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
    };

    const service = new SearchService(
      search_port,
      new VaultStore(),
      new OpStore(),
      () => 1,
      (command) => command.id !== "ai_assistant",
    );

    const results = service.search_commands("ai");

    expect(
      results.some(
        (result) =>
          result.kind === "command" && result.command.id === "ai_assistant",
      ),
    ).toBe(false);
  });

  it("returns stale for out-of-order wiki suggest responses", async () => {
    const first = create_deferred<WikiSuggestion[]>();
    const second = create_deferred<WikiSuggestion[]>();
    let call = 0;

    const search_port = {
      suggest_wiki_links: vi.fn().mockImplementation(() => {
        call += 1;
        return call === 1 ? first.promise : second.promise;
      }),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const op_store = new OpStore();
    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    const first_call = service.suggest_wiki_links("alpha");
    const second_call = service.suggest_wiki_links("alpha beta");

    second.resolve([existing("docs/b.md")]);
    first.resolve([existing("docs/a.md")]);

    await expect(first_call).resolves.toEqual({
      status: "stale",
      results: [],
    });
    await expect(second_call).resolves.toEqual({
      status: "success",
      results: [existing("docs/b.md")],
    });
  });

  it("merges planned suggestions without duplicating existing paths", async () => {
    const search_port = {
      suggest_wiki_links: vi
        .fn()
        .mockResolvedValue([
          existing("docs/a.md", 8),
          existing("docs/b.md", 6),
        ]),
      suggest_planned_links: vi
        .fn()
        .mockResolvedValue([planned("docs/b.md", 12), planned("docs/c.md", 9)]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(
      create_test_vault({
        id: as_vault_id("vault-a"),
        path: as_vault_path("/vault/a"),
      }),
    );

    const service = new SearchService(
      search_port,
      vault_store,
      new OpStore(),
      () => 1,
    );

    const result = await service.suggest_wiki_links("doc");

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      throw new Error("expected success");
    }

    expect(result.results).toEqual([
      existing("docs/a.md", 8),
      existing("docs/b.md", 6),
      {
        kind: "planned",
        target_path: "docs/c.md",
        ref_count: 9,
        score: 9,
      },
    ]);
  });

  it("delegates wiki-link resolution to the search port", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue("docs/wiki.md"),
    };

    const service = new SearchService(
      search_port,
      new VaultStore(),
      new OpStore(),
      () => 1,
    );

    const resolved = await service.resolve_wiki_link("source.md", "docs/wiki");

    expect(resolved).toBe("docs/wiki.md");
    expect(search_port.resolve_wiki_link).toHaveBeenCalledWith(
      "source.md",
      "docs/wiki",
    );
  });

  it("prefers exact indexed root matches for markdown links before creating relative targets", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi
        .fn()
        .mockResolvedValue("docs/exposomics/overview.md"),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
    };

    const vault_store = new VaultStore();
    const vault = create_test_vault({
      id: as_vault_id("vault-link-resolution"),
      path: as_vault_path("/vault/link-resolution"),
    });
    vault_store.set_vault(vault);

    const index_port = create_mock_index_port();
    index_port._mock_note_paths_by_prefix.set(
      `${String(vault.id)}::exposomics/overview.md`,
      ["exposomics/overview.md"],
    );

    const service = new SearchService(
      search_port,
      vault_store,
      new OpStore(),
      () => 1,
      () => true,
      index_port,
    );

    const resolved = await service.resolve_note_link(
      "docs/current.md",
      "exposomics/overview.md",
    );

    expect(resolved).toBe("exposomics/overview.md");
  });

  it("resolves bare wiki links to indexed folder notes when present", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue("exposomics.md"),
    };

    const vault_store = new VaultStore();
    const vault = create_test_vault({
      id: as_vault_id("vault-folder-note"),
      path: as_vault_path("/vault/folder-note"),
    });
    vault_store.set_vault(vault);

    const index_port = create_mock_index_port();
    index_port._mock_note_paths_by_prefix.set(
      `${String(vault.id)}::exposomics.md`,
      [],
    );
    index_port._mock_note_paths_by_prefix.set(
      `${String(vault.id)}::exposomics/exposomics.md`,
      ["exposomics/exposomics.md"],
    );

    const service = new SearchService(
      search_port,
      vault_store,
      new OpStore(),
      () => 1,
      () => true,
      index_port,
    );

    const resolved = await service.resolve_wiki_link(
      "notes/current.md",
      "exposomics",
    );

    expect(resolved).toBe("exposomics/exposomics.md");
  });
});
