import { describe, expect, it } from "vitest";
import { SmartLinksStore } from "$lib/features/smart_links/state/smart_links_store.svelte";
import type { SmartLinkRuleGroup } from "$lib/features/smart_links";

const GROUPS: SmartLinkRuleGroup[] = [
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
        config: {},
      },
      {
        id: "shared_tag",
        name: "Shared tags",
        enabled: true,
        weight: 0.5,
        config: {},
      },
    ],
  },
  {
    id: "semantic",
    name: "Semantic Rules",
    enabled: true,
    rules: [
      {
        id: "semantic_similarity",
        name: "Semantic",
        enabled: true,
        weight: 0.7,
        config: {},
      },
    ],
  },
];

describe("SmartLinksStore", () => {
  it("initializes with idle state", () => {
    const store = new SmartLinksStore();
    expect(store.rules_status).toBe("idle");
    expect(store.rule_groups).toEqual([]);
    expect(store.rules_error).toBeNull();
  });

  it("set_rule_groups transitions to ready", () => {
    const store = new SmartLinksStore();
    store.set_rule_groups(GROUPS);

    expect(store.rules_status).toBe("ready");
    expect(store.rule_groups).toHaveLength(2);
    expect(store.rules_error).toBeNull();
  });

  it("start_rules_load sets loading state", () => {
    const store = new SmartLinksStore();
    store.start_rules_load();

    expect(store.rules_status).toBe("loading");
    expect(store.rules_error).toBeNull();
  });

  it("set_rules_error sets error state", () => {
    const store = new SmartLinksStore();
    store.set_rules_error("something failed");

    expect(store.rules_status).toBe("error");
    expect(store.rules_error).toBe("something failed");
  });

  it("update_rule modifies a specific rule", () => {
    const store = new SmartLinksStore();
    store.set_rule_groups(structuredClone(GROUPS));

    store.update_rule("metadata", "same_day", { enabled: false, weight: 0.1 });

    const same_day = store.rule_groups[0]?.rules.find(
      (r) => r.id === "same_day",
    );
    expect(same_day?.enabled).toBe(false);
    expect(same_day?.weight).toBe(0.1);
    const shared_tag = store.rule_groups[0]?.rules.find(
      (r) => r.id === "shared_tag",
    );
    expect(shared_tag?.enabled).toBe(true);
  });

  it("update_rule is a no-op for non-existent group/rule", () => {
    const store = new SmartLinksStore();
    store.set_rule_groups(structuredClone(GROUPS));
    const before = JSON.stringify(store.rule_groups);

    store.update_rule("nonexistent", "same_day", { enabled: false });

    expect(JSON.stringify(store.rule_groups)).toBe(before);
  });

  it("update_group_enabled toggles group", () => {
    const store = new SmartLinksStore();
    store.set_rule_groups(structuredClone(GROUPS));

    store.update_group_enabled("semantic", false);

    expect(store.rule_groups[1]?.enabled).toBe(false);
    expect(store.rule_groups[0]?.enabled).toBe(true);
  });

  it("clear resets to idle", () => {
    const store = new SmartLinksStore();
    store.set_rule_groups(GROUPS);
    store.clear();

    expect(store.rules_status).toBe("idle");
    expect(store.rule_groups).toEqual([]);
    expect(store.rules_error).toBeNull();
  });
});
