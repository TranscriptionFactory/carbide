import { describe, expect, it } from "vitest";
import { derive_rag_readiness } from "$lib/features/rag/domain/rag_readiness";
import type { EmbeddingStatus } from "$lib/shared/types/search";

function status(overrides: Partial<EmbeddingStatus>): EmbeddingStatus {
  return {
    total_notes: 0,
    embedded_notes: 0,
    model_version: "v1",
    is_embedding: false,
    ...overrides,
  };
}

describe("derive_rag_readiness", () => {
  it("is ready when all notes are embedded", () => {
    expect(
      derive_rag_readiness(status({ total_notes: 10, embedded_notes: 10 })),
    ).toEqual({ state: "ready" });
  });

  it("is ready for an empty vault", () => {
    expect(derive_rag_readiness(status({}))).toEqual({ state: "ready" });
  });

  it("is indexing with counts while embeddings lag behind notes", () => {
    expect(
      derive_rag_readiness(status({ total_notes: 100, embedded_notes: 37 })),
    ).toEqual({ state: "indexing", embedded: 37, total: 100 });
  });

  it("is indexing when the backend reports an active embed run", () => {
    expect(
      derive_rag_readiness(
        status({ total_notes: 5, embedded_notes: 5, is_embedding: true }),
      ),
    ).toEqual({ state: "indexing", embedded: 5, total: 5 });
  });
});
