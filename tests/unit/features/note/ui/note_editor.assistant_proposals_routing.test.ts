/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/app/context/app_context.svelte",
  async () => import("../../../helpers/mock_app_context"),
);
vi.mock(
  "$lib/components/ui/switch/index.js",
  async () => import("../../../helpers/ui_stubs/switch"),
);

import { create_app_stores } from "$lib/app/bootstrap/create_app_stores";
import type { AppContext } from "$lib/app/di/create_app_context";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { Tab } from "$lib/features/tab/types/tab";
import { ASSISTANT_PROPOSALS_TAB_ID } from "$lib/features/tab/domain/assistant_proposals_tab";
import NoteEditor from "$lib/features/note/ui/note_editor.svelte";
import { render_with_app_context } from "../../../helpers/render_with_app_context";
import { flushSync } from "../../../helpers/svelte_client_runtime";
import {
  make_proposal,
  make_proposal_hunk,
} from "../../../helpers/assistant_proposal_fixtures";

function make_proposals_tab(): Tab {
  return {
    id: ASSISTANT_PROPOSALS_TAB_ID,
    title: "Proposals",
    is_pinned: false,
    is_dirty: false,
    pane: "primary",
    kind: "assistant_proposals",
  };
}

function make_open_note(path: string): OpenNoteState {
  return {
    meta: { path, id: path },
    markdown: "# a previously open note",
  } as unknown as OpenNoteState;
}

function render(options: {
  proposals?: ReturnType<typeof make_proposal>[];
  open_note?: OpenNoteState | null;
  execute?: ReturnType<typeof vi.fn>;
}) {
  const stores = create_app_stores();
  const tab = make_proposals_tab();
  stores.tab.tabs = [tab];
  stores.tab.active_tab_id = tab.id;
  stores.assistant_proposals.proposals = options.proposals ?? [];
  if (options.open_note) stores.editor.open_note = options.open_note;

  const execute = options.execute ?? vi.fn().mockResolvedValue(undefined);
  const view = render_with_app_context(NoteEditor, {
    app_context: {
      stores,
      action_registry: { execute } as unknown as AppContext["action_registry"],
      services: { editor: { update_visual_editor_ambient_anchors: vi.fn() } },
    } as unknown as Partial<AppContext>,
    props: {},
  });

  return { ...view, stores, execute };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("note_editor routing for assistant_proposals tabs", () => {
  it("renders the review-center surface for an active proposals tab", () => {
    const view = render({ proposals: [make_proposal()] });

    expect(
      view.target.querySelector('[data-testid="assistant-proposals-tab"]'),
    ).not.toBeNull();
    expect(
      view.target.querySelector('[data-testid="assistant-proposal-card"]'),
    ).not.toBeNull();

    view.cleanup();
  });

  it("does not fall through to the editor of a previously open note", () => {
    const view = render({
      proposals: [make_proposal()],
      open_note: make_open_note("docs/alpha.md"),
    });

    expect(
      view.target.querySelector('[data-testid="assistant-proposals-tab"]'),
    ).not.toBeNull();
    expect(view.target.querySelector(".NoteEditor__content")).toBeNull();
    expect(view.target.querySelector(".NoteEditor__visual-wrapper")).toBeNull();
    expect(view.target.textContent).not.toContain("a previously open note");

    view.cleanup();
  });

  it("renders the empty state inside the tab when there are no pending proposals", () => {
    const view = render({ proposals: [] });

    const empty = view.target.querySelector('[data-testid="empty-message"]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain("No pending proposals");

    view.cleanup();
  });

  it("dispatches assistant_accept_proposal with the proposal id, not a store mutator", () => {
    const proposal = make_proposal();
    const view = render({ proposals: [proposal] });

    const accept_all = view.target.querySelector(
      '[data-testid="assistant-proposal-accept-all"]',
    ) as HTMLButtonElement;
    accept_all.click();

    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.assistant_accept_proposal,
      proposal.id,
    );

    view.cleanup();
  });

  it("dispatches assistant_reject_proposal with the proposal id", () => {
    const proposal = make_proposal();
    const view = render({ proposals: [proposal] });

    const reject = view.target.querySelector(
      '[data-testid="assistant-proposal-reject"]',
    ) as HTMLButtonElement;
    reject.click();

    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.assistant_reject_proposal,
      proposal.id,
    );

    view.cleanup();
  });

  it("dispatches assistant_accept_proposals with every pending id from the header control", () => {
    const proposals = [make_proposal(), make_proposal()];
    const view = render({ proposals });

    const accept_all_pending = view.target.querySelector(
      '[data-testid="assistant-proposals-accept-all-pending"]',
    ) as HTMLButtonElement;
    accept_all_pending.click();

    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.assistant_accept_proposals,
      proposals.map((p) => p.id),
    );

    view.cleanup();
  });

  it("dispatches assistant_set_proposal_hunk_selected with proposal id, hunk id, and the new value — not a direct store call", () => {
    const hunk = make_proposal_hunk({ selected: true });
    const proposal = make_proposal({ hunks: [hunk] });
    const view = render({ proposals: [proposal] });

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

    expect(view.execute).toHaveBeenCalledWith(
      ACTION_IDS.assistant_set_proposal_hunk_selected,
      proposal.id,
      hunk.id,
      false,
    );

    view.cleanup();
  });
});
