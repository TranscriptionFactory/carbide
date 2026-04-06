import type { SmartLinkRuleMatch } from "$lib/features/smart_links/state/smart_links_store.svelte";

const RULE_CHIP_LABELS: Record<string, string> = {
  same_day: "day",
  shared_tag: "tag",
  shared_property: "prop",
  semantic_similarity: "semantic",
  title_overlap: "title",
  shared_outlinks: "links",
};

export function rule_chip_label(rule_id: string): string {
  return RULE_CHIP_LABELS[rule_id] ?? rule_id;
}

export function format_rule_name(id: string): string {
  return id
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function rule_chip_title(rule: SmartLinkRuleMatch): string {
  return `${rule_chip_label(rule.ruleId)} (${String(Math.round(rule.rawScore * 100))}%)`;
}
