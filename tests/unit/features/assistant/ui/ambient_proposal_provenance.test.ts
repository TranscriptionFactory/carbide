/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/components/ui/switch/index.js",
  async () => import("../../../helpers/ui_stubs/switch"),
);

import AssistantProposalsTabView from "$lib/features/assistant/ui/assistant_proposals_tab_view.svelte";
import {
  AMBIENT_PROPOSAL_ORIGIN,
  AMBIENT_SESSION_ID,
} from "$lib/features/assistant";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import { make_proposal } from "../../../helpers/assistant_proposal_fixtures";
import { make_session } from "../../../helpers/assistant_session_fixtures";

// Separate file rather than an addition to
// assistant_proposals_tab_view.test.ts: that file belongs to the review centre
// and this lane should not collide with it.
//
// The contract routes every ambient proposal through one synthetic session id
// that no AssistantSession will ever have. This asserts the review centre
// tolerates the miss instead of dropping the group — checked in phase 1 and
// confirmed to need no contract change.
function render(proposals: Parameters<typeof make_proposal>[0][]) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(AssistantProposalsTabView, {
    target,
    props: {
      proposals: proposals.map((overrides) => make_proposal(overrides)),
      session_summaries: [],
      on_accept_proposal: vi.fn(),
      on_accept_all_pending: vi.fn(),
      on_reject_proposal: vi.fn(),
      on_toggle_hunk: vi.fn(),
    },
  });
  flushSync();
  return {
    target,
    cleanup() {
      void unmount(app);
      target.remove();
      flushSync();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ambient proposals in the review centre", () => {
  // H1
  it("renders a provenance group for the ambient id even with no such session", () => {
    const view = render([{ origin: AMBIENT_PROPOSAL_ORIGIN }]);

    const groups = view.target.querySelectorAll(
      '[data-testid="assistant-proposal-group"]',
    );
    expect(groups).toHaveLength(1);
    expect(
      groups[0]?.querySelector(
        '[data-testid="assistant-proposal-group-provenance"]',
      )?.textContent,
    ).toContain(AMBIENT_SESSION_ID);

    view.cleanup();
  });

  it("keeps ambient findings in their own group beside a real session", () => {
    const view = render([
      { origin: AMBIENT_PROPOSAL_ORIGIN },
      { origin: { session_id: "s1", run_id: null } },
    ]);

    expect(
      view.target.querySelectorAll('[data-testid="assistant-proposal-group"]'),
    ).toHaveLength(2);

    view.cleanup();
  });

  it("collects every ambient finding under one group, not one per notice", () => {
    const view = render([
      { origin: AMBIENT_PROPOSAL_ORIGIN },
      { origin: AMBIENT_PROPOSAL_ORIGIN },
      { origin: AMBIENT_PROPOSAL_ORIGIN },
    ]);

    const groups = view.target.querySelectorAll(
      '[data-testid="assistant-proposal-group"]',
    );
    expect(groups).toHaveLength(1);
    expect(
      groups[0]?.querySelectorAll('[data-testid="assistant-proposal-card"]'),
    ).toHaveLength(3);

    view.cleanup();
  });

  it("does not invent a session title for the ambient group", () => {
    const view = render([{ origin: AMBIENT_PROPOSAL_ORIGIN }]);

    const provenance = view.target.querySelector(
      '[data-testid="assistant-proposal-group-provenance"]',
    );
    expect(provenance?.textContent?.trim()).toBe(`from ${AMBIENT_SESSION_ID}`);

    view.cleanup();
  });

  it("still resolves a real session's title, proving the miss is specific", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const app = mount(AssistantProposalsTabView, {
      target,
      props: {
        proposals: [
          make_proposal({ origin: { session_id: "s1", run_id: null } }),
        ],
        session_summaries: [make_session({ id: "s1", title: "Ranking notes" })],
        on_accept_proposal: vi.fn(),
        on_accept_all_pending: vi.fn(),
        on_reject_proposal: vi.fn(),
        on_toggle_hunk: vi.fn(),
      },
    });
    flushSync();

    expect(
      target.querySelector(
        '[data-testid="assistant-proposal-group-provenance"]',
      )?.textContent,
    ).toContain("Ranking notes");

    void unmount(app);
    target.remove();
    flushSync();
  });
});
