import { vi } from "vitest";
import type {
  AgentTurnProposalReport,
  AgentTurnProposalRequest,
} from "$lib/features/rag/application/agent_proposal_service";

export function empty_proposal_report(): AgentTurnProposalReport {
  return {
    status: "produced",
    proposed: [],
    reverted_deletions: [],
    kept_creations: [],
    skipped_non_note: [],
    skipped_binary: [],
    failed: [],
  };
}

// `calls` opts the double into the ordering log the runner tests use to assert
// that proposals are produced before the vault refresh.
export function create_test_proposal_producer(calls?: string[]) {
  return {
    produce: vi.fn((request: AgentTurnProposalRequest) => {
      calls?.push("proposals");
      return Promise.resolve({
        ...empty_proposal_report(),
        proposed: [...request.touched_paths],
      });
    }),
  };
}
