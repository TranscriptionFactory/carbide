import { describe, expect, it } from "vitest";
import {
  SIMILARITY_TOOLTIP,
  similarity_label,
} from "$lib/features/links/domain/similarity_label";

describe("similarity_label", () => {
  it("shows 100% only when the embedding is exactly identical (distance 0)", () => {
    expect(similarity_label(1)).toBe("100%");
  });

  it("clamps a near-identical-but-not-identical score below 100%", () => {
    expect(similarity_label(0.999)).toBe("99%");
    expect(similarity_label(0.996)).toBe("99%");
  });

  it("rounds ordinary similarities to whole percentages", () => {
    expect(similarity_label(0.844)).toBe("84%");
    expect(similarity_label(0.505)).toBe("51%");
  });

  it("never reports 100% for sub-unity scores that would round up", () => {
    expect(similarity_label(0.9951)).toBe("99%");
  });

  it("explains cosine similarity of note embeddings in the tooltip", () => {
    expect(SIMILARITY_TOOLTIP).toContain("Cosine similarity");
    expect(SIMILARITY_TOOLTIP).toContain("1.0 = identical");
  });
});
