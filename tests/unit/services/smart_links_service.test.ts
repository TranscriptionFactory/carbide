import { describe, expect, it, vi } from "vitest";
import { SmartLinksService } from "$lib/features/smart_links/application/smart_links_service";
import { SmartLinksStore } from "$lib/features/smart_links/state/smart_links_store.svelte";
import type { SmartLinkRuleGroup } from "$lib/features/smart_links";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { create_test_vault } from "../helpers/test_fixtures";

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
    extract_local_note_links: vi.fn().mockResolvedValue({
      outlink_paths: [],
      external_links: [],
    }),
    rewrite_note_links: vi
      .fn()
      .mockResolvedValue({ markdown: "", changed: false }),
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
    ...overrides,
  };
}

const DEFAULT_RULES: SmartLinkRuleGroup[] = [
  {
    id: "metadata",
    name: "Metadata Rules",
    enabled: true,
    rules: [
      {
        id: "same_day",
        name: "Same day",
        enabled: true,
        weight: 0.3,
      },
      {
        id: "shared_tag",
        name: "Shared tags",
        enabled: true,
        weight: 0.5,
      },
    ],
  },
];

describe("SmartLinksService", () => {
  it("loads rules from port and updates store", async () => {
    const search_port = make_search_port({
      load_smart_link_rules: vi.fn().mockResolvedValue(DEFAULT_RULES),
    });
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const store = new SmartLinksStore();

    const service = new SmartLinksService(search_port, vault_store, store);
    await service.load_rules();

    expect(store.rules_status).toBe("ready");
    expect(store.rule_groups).toHaveLength(1);
    expect(store.rule_groups[0]?.rules).toHaveLength(2);
  });

  it("sets error when load fails", async () => {
    const search_port = make_search_port({
      load_smart_link_rules: vi.fn().mockRejectedValue(new Error("disk error")),
    });
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const store = new SmartLinksStore();

    const service = new SmartLinksService(search_port, vault_store, store);
    await service.load_rules();

    expect(store.rules_status).toBe("error");
    expect(store.rules_error).toBe("disk error");
  });

  it("clears store when no vault is active", async () => {
    const search_port = make_search_port();
    const vault_store = new VaultStore();
    const store = new SmartLinksStore();
    store.set_rule_groups(DEFAULT_RULES);

    const service = new SmartLinksService(search_port, vault_store, store);
    await service.load_rules();

    expect(store.rules_status).toBe("idle");
    expect(store.rule_groups).toEqual([]);
  });

  it("toggle_rule updates store and saves", async () => {
    const search_port = make_search_port();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const store = new SmartLinksStore();
    store.set_rule_groups(structuredClone(DEFAULT_RULES));

    const service = new SmartLinksService(search_port, vault_store, store);
    await service.toggle_rule("metadata", "same_day", false);

    const same_day = store.rule_groups[0]?.rules.find(
      (r) => r.id === "same_day",
    );
    expect(same_day?.enabled).toBe(false);
    expect(search_port.save_smart_link_rules).toHaveBeenCalledOnce();
  });

  it("update_weight updates store and saves", async () => {
    const search_port = make_search_port();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const store = new SmartLinksStore();
    store.set_rule_groups(structuredClone(DEFAULT_RULES));

    const service = new SmartLinksService(search_port, vault_store, store);
    await service.update_weight("metadata", "shared_tag", 0.8);

    const shared_tag = store.rule_groups[0]?.rules.find(
      (r) => r.id === "shared_tag",
    );
    expect(shared_tag?.weight).toBe(0.8);
    expect(search_port.save_smart_link_rules).toHaveBeenCalledOnce();
  });

  it("toggle_group updates group enabled state", async () => {
    const search_port = make_search_port();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const store = new SmartLinksStore();
    store.set_rule_groups(structuredClone(DEFAULT_RULES));

    const service = new SmartLinksService(search_port, vault_store, store);
    await service.toggle_group("metadata", false);

    expect(store.rule_groups[0]?.enabled).toBe(false);
    expect(search_port.save_smart_link_rules).toHaveBeenCalledOnce();
  });
});
