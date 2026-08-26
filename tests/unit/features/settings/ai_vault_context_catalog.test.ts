import { describe, expect, it } from "vitest";
import { SETTINGS_REGISTRY } from "$lib/features/settings/domain/settings_catalog";

const INLINE_AI_KEYS = [
  "ai_vault_context_enabled",
  "ai_vault_context_similar_limit",
  "ai_vault_context_include_links",
  "ai_vault_context_similarity_threshold",
] as const;

const CHAT_RETRIEVAL_KEYS = [
  "ai_rag_retrieve_limit",
  "ai_rag_context_token_budget",
  "ai_rag_history_token_budget",
] as const;

function entry(key: string) {
  return SETTINGS_REGISTRY.find((definition) => definition.key === key);
}

describe("inline-AI vault context settings are findable and scoped", () => {
  // Settings search is the surface a user reaches for when a control's label
  // is ambiguous, and "Similarity Threshold" is ambiguous: the Semantic
  // category ships a setting under the same label. An entry missing here means
  // the only way to learn what a control governs is to already know.
  it.each(INLINE_AI_KEYS)("registers %s in the catalog", (key) => {
    expect(entry(key)).toBeDefined();
  });

  it.each(INLINE_AI_KEYS)("files %s under AI", (key) => {
    expect(entry(key)?.category).toBe("AI");
  });

  // The two settings a reader most often mistakes for chat controls: they are
  // read by inline AI and by generated descriptions, and never by vault chat.
  it.each([
    "ai_vault_context_similar_limit",
    "ai_vault_context_similarity_threshold",
  ] as const)("states that %s does not govern vault chat", (key) => {
    const description = entry(key)?.description ?? "";

    expect(description).toMatch(/inline AI/i);
    expect(description).toMatch(/not (to )?(affect |apply to )?vault chat/i);
  });

  it("keeps the label collision with the Semantic threshold disambiguated by category", () => {
    const collisions = SETTINGS_REGISTRY.filter(
      (definition) => definition.label === "Similarity Threshold",
    );

    expect(collisions.map((definition) => definition.category).sort()).toEqual([
      "AI",
      "Semantic",
    ]);
  });

  it.each(CHAT_RETRIEVAL_KEYS)(
    "keeps %s described as a chat control",
    (key) => {
      expect(entry(key)?.description ?? "").toMatch(/chat/i);
    },
  );
});
