import { describe, expect, it, vi } from "vitest";
import { ProposalPersistenceService } from "$lib/features/assistant";
import type { ProposalPersistencePort } from "$lib/features/assistant";
import { create_test_assistant_proposal_persistence_adapter } from "../../adapters/test_assistant_proposal_persistence_adapter";
import { make_proposal } from "../helpers/assistant_proposal_fixtures";

const NOW = 1_700_000_200_000;

function make_service(port: ProposalPersistencePort) {
  return new ProposalPersistenceService(port, () => NOW);
}

describe("ProposalPersistenceService", () => {
  it("round-trips pending proposals through the port", async () => {
    const port = create_test_assistant_proposal_persistence_adapter();
    const service = make_service(port);
    const proposal = make_proposal();

    await service.save_pending("v1", [proposal]);

    expect(await service.load_pending("v1")).toEqual([proposal]);
  });

  it("saves only the pending subset", async () => {
    const port = create_test_assistant_proposal_persistence_adapter();
    const service = make_service(port);
    const pending = make_proposal({ status: "pending" });

    await service.save_pending("v1", [
      pending,
      make_proposal({ status: "applied" }),
      make_proposal({ status: "stale" }),
    ]);

    expect(await service.load_pending("v1")).toEqual([pending]);
  });

  it("returns an empty queue for a vault that has never saved", async () => {
    const service = make_service(
      create_test_assistant_proposal_persistence_adapter(),
    );

    expect(await service.load_pending("fresh")).toEqual([]);
  });

  it("swallows and logs a save failure — Browse mode rejects .carbide writes", async () => {
    const port: ProposalPersistencePort = {
      load_proposals: () => Promise.resolve(null),
      save_proposals: vi.fn(() =>
        Promise.reject(new Error("browse mode: read-only vault")),
      ),
    };
    const service = make_service(port);

    await expect(
      service.save_pending("v1", [make_proposal()]),
    ).resolves.toBeUndefined();
  });

  it("degrades a read failure to an empty queue", async () => {
    const port: ProposalPersistencePort = {
      load_proposals: () => Promise.reject(new Error("io error")),
      save_proposals: () => Promise.resolve(),
    };
    const service = make_service(port);

    expect(await service.load_pending("v1")).toEqual([]);
  });
});
