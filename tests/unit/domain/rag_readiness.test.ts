import { describe, expect, it } from "vitest";
import { derive_rag_readiness } from "$lib/features/rag/domain/rag_readiness";
import type { EmbeddingStatus } from "$lib/shared/types/search";

// Defaults describe the vault the bug was reported on: markdown plus one file
// the pass never selects, already attempted.
function status(overrides: Partial<EmbeddingStatus>): EmbeddingStatus {
  return {
    total_notes: 0,
    embedded_notes: 0,
    eligible_notes: 0,
    embedded_eligible_notes: 0,
    skipped_notes: 0,
    embed_attempt_completed: false,
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

  /**
   * The re-reported bug: the vault holds a markdown note beside an image, a code
   * file and an empty note, so the raw counts can never agree. Coverage is
   * measured against the notes the pass can embed, and it is complete.
   */
  it("is ready once the pass has embedded every eligible note", () => {
    expect(
      derive_rag_readiness(
        status({
          total_notes: 4,
          embedded_notes: 1,
          eligible_notes: 1,
          embedded_eligible_notes: 1,
          embed_attempt_completed: true,
        }),
      ),
    ).toEqual({ state: "ready" });
  });

  it("is indexing with counts while embeddings lag behind notes", () => {
    expect(
      derive_rag_readiness(
        status({
          total_notes: 100,
          embedded_notes: 37,
          eligible_notes: 100,
          embedded_eligible_notes: 37,
        }),
      ),
    ).toEqual({ state: "indexing", embedded: 37, total: 100 });
  });

  it("is indexing when the backend reports an active embed run", () => {
    expect(
      derive_rag_readiness(
        status({
          total_notes: 5,
          embedded_notes: 5,
          eligible_notes: 5,
          embedded_eligible_notes: 5,
          is_embedding: true,
        }),
      ),
    ).toEqual({ state: "indexing", embedded: 5, total: 5 });
  });

  /**
   * A pass in flight outranks every count, including a complete-looking one:
   * its snapshot predates the notes it is about to embed.
   */
  it("is indexing while a pass runs even with nothing left eligible", () => {
    expect(
      derive_rag_readiness(status({ eligible_notes: 0, is_embedding: true })),
    ).toEqual({ state: "indexing", embedded: 0, total: 0 });
  });

  /**
   * Startup has not queued a pass yet, so incomplete coverage is work still to
   * come — not a finished, partial index.
   */
  it("is indexing before any attempt has ended", () => {
    expect(
      derive_rag_readiness(
        status({
          total_notes: 100,
          embedded_notes: 37,
          eligible_notes: 100,
          embedded_eligible_notes: 37,
        }),
      ),
    ).toEqual({ state: "indexing", embedded: 37, total: 100 });
  });

  it("is partial once an ended attempt left eligible notes behind", () => {
    expect(
      derive_rag_readiness(
        status({
          total_notes: 40,
          embedded_notes: 12,
          eligible_notes: 14,
          embedded_eligible_notes: 12,
          skipped_notes: 2,
          embed_attempt_completed: true,
        }),
      ),
    ).toEqual({ state: "partial", embedded: 12, total: 14, skipped: 2 });
  });

  /** The retry: the same counts after a later attempt finishes are ready. */
  it("is ready when a later attempt completes the coverage", () => {
    expect(
      derive_rag_readiness(
        status({
          total_notes: 40,
          embedded_notes: 14,
          eligible_notes: 14,
          embedded_eligible_notes: 14,
          embed_attempt_completed: true,
        }),
      ),
    ).toEqual({ state: "ready" });
  });

  /** Out-of-scope vectors live in the raw count; only eligible ones count here. */
  it("ignores vectors outside the eligible set", () => {
    expect(
      derive_rag_readiness(
        status({
          total_notes: 6,
          embedded_notes: 9,
          eligible_notes: 2,
          embedded_eligible_notes: 2,
          embed_attempt_completed: true,
        }),
      ),
    ).toEqual({ state: "ready" });
  });
});
