import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_assistant_notice_actions } from "$lib/features/assistant/application/assistant_notice_actions";
import {
  AMBIENT_SESSION_ID,
  AssistantNoticeStore,
  AssistantProposalStore,
} from "$lib/features/assistant";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { GraphStore } from "$lib/features/graph";
import { BasesStore } from "$lib/features/bases/state/bases_store.svelte";
import { TaskStore } from "$lib/features/task/state/task_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import { ParsedNoteCache } from "$lib/features/note/state/parsed_note_cache.svelte";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { as_markdown_text } from "$lib/shared/types/ids";
import { make_ambient_notice } from "../helpers/assistant_notice_fixtures";
import { create_test_vault } from "../helpers/test_fixtures";

const NOTE = "notes/ranking-experiments.md";
const MARKDOWN = "Compare [[fusion-weights]] against [[baseline]].\n";

function create_harness(markdown = MARKDOWN) {
  const registry = new ActionRegistry();
  const assistant_notices = new AssistantNoticeStore();
  const assistant_proposals = new AssistantProposalStore();

  const vault = new VaultStore();
  vault.set_vault(create_test_vault());

  const stores = {
    ui: new UIStore(),
    vault,
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    graph: new GraphStore(),
    bases: new BasesStore(),
    task: new TaskStore(),
    outline: new OutlineStore(),
    parsed_note_cache: new ParsedNoteCache(),
    reference: new ReferenceStore(),
  };

  // F1/F2/F5: the write path is spied so "never writes a note" is proven, not
  // inspected. `read_note` is the only note IO the accept handler may do.
  const write_note_indexed = vi.fn().mockResolvedValue(undefined);
  const services = {
    note: {
      read_note: vi.fn().mockResolvedValue({
        meta: { title: "demo" },
        markdown: as_markdown_text(markdown),
      }),
      write_note_indexed,
    },
    vault: {},
    folder: {},
    settings: {},
    search: {},
    editor: {},
    clipboard: {},
    shell: {},
    tab: {},
    git: {},
    hotkey: {},
    theme: {},
    reference: {},
    document: {},
    clip: {},
  };

  register_assistant_notice_actions({
    registry,
    stores,
    services,
    default_mount_config: {},
    assistant_notices,
    assistant_proposals,
  } as never);

  return {
    registry,
    assistant_notices,
    assistant_proposals,
    write_note_indexed,
    services,
  };
}

function stale_link_notice() {
  return make_ambient_notice({
    note_path: NOTE,
    kind: "stale_link",
    anchor: { kind: "text", match: "fusion-weights", occurrence: 0 },
    offer: {
      action_id: ACTION_IDS.assistant_accept_notice,
      label: "Remove link",
    },
  });
}

function seed(
  h: ReturnType<typeof create_harness>,
  notice = stale_link_notice(),
) {
  h.assistant_notices.replace_for_note(notice.note_path, [notice]);
  return notice;
}

describe("assistant notice actions — I6 offer-only", () => {
  // F2
  it("accepting enqueues a pending proposal and writes nothing", async () => {
    const h = create_harness();
    const notice = seed(h);

    await h.registry.execute(ACTION_IDS.assistant_accept_notice, notice.id);

    expect(h.assistant_proposals.proposals).toHaveLength(1);
    expect(h.assistant_proposals.proposals[0]?.status).toBe("pending");
    expect(h.assistant_proposals.proposals[0]?.note_path).toBe(NOTE);
    expect(h.write_note_indexed).not.toHaveBeenCalled();
  });

  // F3
  it("stamps the shared ambient provenance so the review centre groups it", async () => {
    const h = create_harness();
    const notice = seed(h);

    await h.registry.execute(ACTION_IDS.assistant_accept_notice, notice.id);

    expect(h.assistant_proposals.proposals[0]?.origin).toEqual({
      session_id: AMBIENT_SESSION_ID,
      run_id: null,
    });
  });

  it("computes a non-null base revision against the pre-edit text", async () => {
    const h = create_harness();
    const notice = seed(h);

    await h.registry.execute(ACTION_IDS.assistant_accept_notice, notice.id);

    expect(h.assistant_proposals.proposals[0]?.base_revision).toBeTruthy();
    expect(h.assistant_proposals.proposals[0]?.hunks.length).toBeGreaterThan(0);
  });

  // The proposed edit itself: the broken link is unwrapped, the healthy one
  // beside it is untouched.
  it("proposes removing only the broken link", async () => {
    const h = create_harness();
    const notice = seed(h);

    await h.registry.execute(ACTION_IDS.assistant_accept_notice, notice.id);

    const added = h.assistant_proposals.proposals[0]?.hunks
      .flatMap((hunk) => hunk.lines)
      .filter((line) => line.kind === "add")
      .map((line) => line.content)
      .join("\n");

    expect(added).toContain("fusion-weights");
    expect(added).not.toContain("[[fusion-weights]]");
    expect(added).toContain("[[baseline]]");
  });

  // F4
  it("retires the notice once it has become a proposal", async () => {
    const h = create_harness();
    const notice = seed(h);

    await h.registry.execute(ACTION_IDS.assistant_accept_notice, notice.id);

    expect(h.assistant_notices.get(notice.id)).toBeNull();
  });

  it("cannot double-fire: a second accept enqueues nothing further", async () => {
    const h = create_harness();
    const notice = seed(h);

    await h.registry.execute(ACTION_IDS.assistant_accept_notice, notice.id);
    await h.registry.execute(ACTION_IDS.assistant_accept_notice, notice.id);

    expect(h.assistant_proposals.proposals).toHaveLength(1);
  });

  // F5
  it("dismissing enqueues no proposal and writes nothing", async () => {
    const h = create_harness();
    const notice = seed(h);

    await h.registry.execute(ACTION_IDS.assistant_dismiss_notice, notice.id);

    expect(h.assistant_notices.get(notice.id)).toBeNull();
    expect(h.assistant_proposals.proposals).toEqual([]);
    expect(h.write_note_indexed).not.toHaveBeenCalled();
  });

  // An anchor whose text has already been edited away yields no derivable
  // edit. The notice retires rather than leaving a card whose offer is dead.
  it("enqueues nothing when the anchored link is already gone", async () => {
    const h = create_harness("Nothing links out any more.\n");
    const notice = seed(h);

    await h.registry.execute(ACTION_IDS.assistant_accept_notice, notice.id);

    expect(h.assistant_proposals.proposals).toEqual([]);
    expect(h.assistant_notices.get(notice.id)).toBeNull();
    expect(h.write_note_indexed).not.toHaveBeenCalled();
  });

  // An orphan_note finding has no deterministic single-note repair; its offer
  // is the decline verb. Accept must still refuse to invent one.
  it("enqueues nothing for a kind with no derivable repair", async () => {
    const h = create_harness();
    const notice = seed(
      h,
      make_ambient_notice({
        note_path: NOTE,
        kind: "orphan_note",
        anchor: { kind: "note" },
        offer: {
          action_id: ACTION_IDS.assistant_dismiss_notice,
          label: "Got it",
        },
      }),
    );

    await h.registry.execute(ACTION_IDS.assistant_accept_notice, notice.id);

    expect(h.assistant_proposals.proposals).toEqual([]);
    expect(h.write_note_indexed).not.toHaveBeenCalled();
  });

  it("ignores an unknown notice id", async () => {
    const h = create_harness();

    await h.registry.execute(ACTION_IDS.assistant_accept_notice, "nope");
    await h.registry.execute(ACTION_IDS.assistant_dismiss_notice, "nope");

    expect(h.assistant_proposals.proposals).toEqual([]);
  });

  it("reads the open buffer rather than disk when the note is open", async () => {
    const h = create_harness();
    const notice = seed(h);

    await h.registry.execute(ACTION_IDS.assistant_accept_notice, notice.id);

    expect(h.services.note.read_note).toHaveBeenCalledWith(
      expect.anything(),
      NOTE,
    );
  });
});
