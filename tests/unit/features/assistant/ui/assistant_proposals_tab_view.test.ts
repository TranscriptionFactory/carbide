/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/components/ui/switch/index.js",
  async () => import("../../../helpers/ui_stubs/switch"),
);

import AssistantProposalsTabView from "$lib/features/assistant/ui/assistant_proposals_tab_view.svelte";
import type { Proposal } from "$lib/features/assistant";
import {
  flushSync,
  mount,
  unmount,
} from "../../../helpers/svelte_client_runtime";
import {
  make_proposal,
  make_proposal_hunk,
  make_proposal_line,
} from "../../../helpers/assistant_proposal_fixtures";
import { make_session } from "../../../helpers/assistant_session_fixtures";

function render(options: {
  proposals: Proposal[];
  session_summaries?: ReturnType<typeof make_session>[];
  on_accept_proposal?: (id: string) => void;
  on_accept_all_pending?: (ids: string[]) => void;
  on_reject_proposal?: (id: string) => void;
  on_toggle_hunk?: (id: string, hunk_id: string, selected: boolean) => void;
}) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = mount(AssistantProposalsTabView, {
    target,
    props: {
      proposals: options.proposals,
      session_summaries: options.session_summaries ?? [],
      on_accept_proposal: options.on_accept_proposal ?? vi.fn(),
      on_accept_all_pending: options.on_accept_all_pending ?? vi.fn(),
      on_reject_proposal: options.on_reject_proposal ?? vi.fn(),
      on_toggle_hunk: options.on_toggle_hunk ?? vi.fn(),
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

describe("assistant_proposals_tab_view empty state", () => {
  it("renders the empty state when there are no pending proposals", () => {
    const view = render({ proposals: [] });

    const empty = view.target.querySelector('[data-testid="empty-message"]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain("No pending proposals");
    expect(
      view.target.querySelector('[data-testid="assistant-proposal-card"]'),
    ).toBeNull();
    expect(
      view.target.querySelector(
        '[data-testid="assistant-proposals-accept-all-pending"]',
      ),
    ).toBeNull();

    view.cleanup();
  });
});

describe("assistant_proposals_tab_view provenance grouping", () => {
  it("groups proposals from the same session under one heading", () => {
    const proposals = [
      make_proposal({ origin: { session_id: "s1", run_id: null } }),
      make_proposal({ origin: { session_id: "s1", run_id: null } }),
    ];
    const view = render({
      proposals,
      session_summaries: [make_session({ id: "s1", title: "Ranking notes" })],
    });

    const groups = view.target.querySelectorAll(
      '[data-testid="assistant-proposal-group"]',
    );
    expect(groups).toHaveLength(1);
    expect(
      groups[0]?.querySelectorAll('[data-testid="assistant-proposal-card"]'),
    ).toHaveLength(2);
    expect(
      view.target.querySelector(
        '[data-testid="assistant-proposal-group-provenance"]',
      )?.textContent,
    ).toContain("Ranking notes");

    view.cleanup();
  });

  it("renders proposals from different sessions as separate groups", () => {
    const proposals = [
      make_proposal({ origin: { session_id: "s1", run_id: null } }),
      make_proposal({ origin: { session_id: "s2", run_id: null } }),
    ];
    const view = render({
      proposals,
      session_summaries: [
        make_session({ id: "s1", title: "First" }),
        make_session({ id: "s2", title: "Second" }),
      ],
    });

    expect(
      view.target.querySelectorAll('[data-testid="assistant-proposal-group"]'),
    ).toHaveLength(2);

    view.cleanup();
  });

  it("falls back to the raw session id when the session is unresolvable", () => {
    const view = render({
      proposals: [
        make_proposal({ origin: { session_id: "gone", run_id: null } }),
      ],
      session_summaries: [],
    });

    expect(
      view.target.querySelector(
        '[data-testid="assistant-proposal-group-provenance"]',
      )?.textContent,
    ).toContain("gone");

    view.cleanup();
  });

  it("groups a run_id: null proposal (non-kernel-run producer) by session_id alone", () => {
    const view = render({
      proposals: [
        make_proposal({ origin: { session_id: "s1", run_id: null } }),
      ],
      session_summaries: [make_session({ id: "s1", title: "Ambient" })],
    });

    expect(
      view.target.querySelectorAll('[data-testid="assistant-proposal-group"]'),
    ).toHaveLength(1);

    view.cleanup();
  });

  it("only shows pending proposals passed to it", () => {
    // The tab view trusts its `proposals` prop; pending-only filtering is the
    // routing site's job (stores.assistant_proposals.pending). This asserts
    // the view itself renders exactly what it is given, nothing filtered
    // again internally in a way that would mask a routing-site regression.
    const proposals = [make_proposal()];
    const view = render({ proposals });

    expect(
      view.target.querySelectorAll('[data-testid="assistant-proposal-card"]'),
    ).toHaveLength(1);

    view.cleanup();
  });
});

describe("assistant_proposals_tab_view per-hunk toggles", () => {
  it("renders a toggle per hunk reflecting the fixture's default selection", () => {
    const view = render({ proposals: [make_proposal()] });

    view.target
      .querySelector('[data-testid="assistant-proposal-review-hunks"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();

    const toggles = view.target.querySelectorAll<HTMLInputElement>(
      '[data-testid="assistant-proposal-diff"] input[type="checkbox"]',
    );
    expect(toggles).toHaveLength(1);
    expect(toggles[0]?.checked).toBe(true);

    view.cleanup();
  });

  it("renders all three line kinds for a hunk composed with an explicit context line", () => {
    const hunk = make_proposal_hunk({
      lines: [
        make_proposal_line({ kind: "context", content: "unchanged line" }),
        make_proposal_line({
          kind: "del",
          content: "old",
          new_line: null,
        }),
        make_proposal_line({ kind: "add", content: "new", old_line: null }),
      ],
    });
    const view = render({ proposals: [make_proposal({ hunks: [hunk] })] });

    (
      view.target.querySelector(
        '[data-testid="assistant-proposal-review-hunks"]',
      ) as HTMLButtonElement
    ).click();
    flushSync();

    const lines = view.target.querySelectorAll(
      '[data-testid="assistant-proposal-line"]',
    );
    expect(
      Array.from(lines).map((line) => line.getAttribute("data-kind")),
    ).toEqual(["context", "del", "add"]);

    view.cleanup();
  });

  it("dispatches on_toggle_hunk with the proposal id, hunk id, and new selected value — through the callback prop, not a direct store call", () => {
    // Toggling used to be local-only (no ACTION_ID existed to carry a hunk
    // selection back to the store). ACTION_IDS.assistant_set_proposal_hunk_selected
    // now exists, so the view must forward the toggle through its
    // on_toggle_hunk prop — the same callback-prop boundary already used for
    // accept/reject — rather than holding it in local state or reaching past
    // the action layer into the store.
    const hunk = make_proposal_hunk({ selected: true });
    const proposal = make_proposal({ hunks: [hunk] });
    const on_toggle_hunk = vi.fn();
    const view = render({ proposals: [proposal], on_toggle_hunk });

    (
      view.target.querySelector(
        '[data-testid="assistant-proposal-review-hunks"]',
      ) as HTMLButtonElement
    ).click();
    flushSync();

    const toggle = view.target.querySelector(
      '[data-testid="assistant-proposal-diff"] input[type="checkbox"]',
    ) as HTMLInputElement;
    toggle.click();
    flushSync();

    expect(on_toggle_hunk).toHaveBeenCalledWith(proposal.id, hunk.id, false);
    expect(on_toggle_hunk).toHaveBeenCalledTimes(1);

    view.cleanup();
  });

  it("reflects the hunk's own selected field on the toggle, since selection now lives in the store", () => {
    const selected_hunk = make_proposal_hunk({ selected: true });
    const deselected_hunk = make_proposal_hunk({ selected: false });
    const proposal = make_proposal({ hunks: [selected_hunk, deselected_hunk] });
    const view = render({ proposals: [proposal] });

    (
      view.target.querySelector(
        '[data-testid="assistant-proposal-review-hunks"]',
      ) as HTMLButtonElement
    ).click();
    flushSync();

    const toggles = view.target.querySelectorAll<HTMLInputElement>(
      '[data-testid="assistant-proposal-diff"] input[type="checkbox"]',
    );
    expect(toggles[0]?.checked).toBe(true);
    expect(toggles[1]?.checked).toBe(false);
    expect(
      view.target.querySelector('[data-testid="assistant-proposal-selected"]')
        ?.textContent,
    ).toContain("1 of 2 selected");

    view.cleanup();
  });

  it("starts with the diff collapsed", () => {
    const view = render({ proposals: [make_proposal()] });

    expect(
      view.target.querySelector('[data-testid="assistant-proposal-diff"]'),
    ).toBeNull();

    view.cleanup();
  });
});

describe("assistant_proposals_tab_view dispatch", () => {
  it("calls on_accept_proposal with the proposal id from the per-card button", () => {
    const proposal = make_proposal();
    const on_accept_proposal = vi.fn();
    const view = render({ proposals: [proposal], on_accept_proposal });

    (
      view.target.querySelector(
        '[data-testid="assistant-proposal-accept-all"]',
      ) as HTMLButtonElement
    ).click();

    expect(on_accept_proposal).toHaveBeenCalledWith(proposal.id);
    expect(on_accept_proposal).toHaveBeenCalledTimes(1);

    view.cleanup();
  });

  it("calls on_reject_proposal with the proposal id from the per-card button", () => {
    const proposal = make_proposal();
    const on_reject_proposal = vi.fn();
    const view = render({ proposals: [proposal], on_reject_proposal });

    (
      view.target.querySelector(
        '[data-testid="assistant-proposal-reject"]',
      ) as HTMLButtonElement
    ).click();

    expect(on_reject_proposal).toHaveBeenCalledWith(proposal.id);

    view.cleanup();
  });

  it("calls on_accept_all_pending with every pending proposal id from the header control", () => {
    const proposals = [make_proposal(), make_proposal(), make_proposal()];
    const on_accept_all_pending = vi.fn();
    const view = render({ proposals, on_accept_all_pending });

    (
      view.target.querySelector(
        '[data-testid="assistant-proposals-accept-all-pending"]',
      ) as HTMLButtonElement
    ).click();

    expect(on_accept_all_pending).toHaveBeenCalledWith(
      proposals.map((p) => p.id),
    );

    view.cleanup();
  });
});
