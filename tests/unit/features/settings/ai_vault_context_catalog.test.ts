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
  // is ambiguous. An entry missing here means the only way to learn what a
  // control governs is to already know.
  it.each(INLINE_AI_KEYS)("registers %s in the catalog", (key) => {
    expect(entry(key)).toBeDefined();
  });

  it.each(INLINE_AI_KEYS)("files %s under AI", (key) => {
    expect(entry(key)?.category).toBe("AI");
  });

  // The three sub-settings route through the same helper on both consuming
  // paths, so each genuinely governs inline AI as well as generated
  // descriptions, and neither is read by vault chat.
  it.each([
    "ai_vault_context_similar_limit",
    "ai_vault_context_include_links",
    "ai_vault_context_similarity_threshold",
  ] as const)("states that %s does not govern vault chat", (key) => {
    const description = entry(key)?.description ?? "";

    expect(description).toMatch(/inline AI/i);
    expect(description).toMatch(/not (to )?(affect |apply to )?vault chat/i);
  });

  // The master toggle is the odd one out: the inline path hardcodes `enabled`
  // to true and never consults this key, so it reaches only the generated
  // description. Claiming it governs inline AI would be the same class of wrong
  // copy this suite exists to catch, one level down.
  it("scopes the master toggle to generated descriptions, not inline AI", () => {
    const description = entry("ai_vault_context_enabled")?.description ?? "";

    expect(description).toMatch(/generates a note description/i);
    expect(description).toMatch(/Inline AI Vault Context/);
    expect(description).toMatch(/vault chat reads neither/i);
  });

  // These two thresholds have opposite polarity — one is a distance, the other
  // a similarity — so a shared label reads as one control with one meaning.
  it("does not share a label with the Semantic threshold", () => {
    const ai = entry("ai_vault_context_similarity_threshold")?.label;
    const semantic = entry("semantic_similarity_threshold")?.label;

    expect(ai).toBe("Max Context Distance");
    expect(semantic).toBe("Min Semantic Similarity");
    expect(
      SETTINGS_REGISTRY.filter((definition) => definition.label === ai),
    ).toHaveLength(1);
  });

  it.each(CHAT_RETRIEVAL_KEYS)(
    "keeps %s described as a chat control",
    (key) => {
      expect(entry(key)?.description ?? "").toMatch(/chat/i);
    },
  );
});
