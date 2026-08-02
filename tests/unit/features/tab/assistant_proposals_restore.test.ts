import { describe, expect, it, vi } from "vitest";
import { TabService } from "$lib/features/tab/application/tab_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import {
  ASSISTANT_PROPOSALS_TAB_ID,
  ASSISTANT_PROPOSALS_TAB_TITLE,
} from "$lib/features/tab/domain/assistant_proposals_tab";
import { as_note_path, as_vault_id } from "$lib/shared/types/ids";
import type { PersistedTabState } from "$lib/features/tab";
import { create_test_vault } from "../../helpers/test_fixtures";

function create_setup() {
  const vault_settings_port = {
    get_vault_setting: vi.fn().mockResolvedValue(null),
    set_vault_setting: vi.fn().mockResolvedValue(undefined),
    get_local_setting: vi.fn().mockResolvedValue(null),
    set_local_setting: vi.fn().mockResolvedValue(undefined),
  };
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault({ id: as_vault_id("vault-a") }));
  const tab_store = new TabStore();
  const notes_store = new NotesStore();
  const note_service = {
    open_note: vi.fn().mockResolvedValue({ status: "opened" }),
    read_note: vi.fn(),
  };
  const service = new TabService(
    vault_settings_port as never,
    vault_store,
    tab_store,
    notes_store,
    note_service as never,
  );

  return { service, vault_settings_port, tab_store, note_service };
}

function persisted(
  tabs: PersistedTabState["tabs"],
  active_tab_path: string | null = null,
): PersistedTabState {
  return { tabs, active_tab_path };
}

describe("assistant_proposals tab persistence", () => {
  it("persists the tab with a null cursor and no extra fields", async () => {
    const { service, vault_settings_port, tab_store } = create_setup();
    tab_store.open_assistant_proposals_tab(
      ASSISTANT_PROPOSALS_TAB_ID,
      ASSISTANT_PROPOSALS_TAB_TITLE,
    );

    await service.save_tabs();

    const [, , state] = vault_settings_port.set_local_setting.mock
      .calls[0] as unknown as [string, string, PersistedTabState];
    expect(state.tabs).toEqual([
      { kind: "assistant_proposals", is_pinned: false, cursor: null },
    ]);
  });

  it("records the proposals tab as the active tab", async () => {
    const { service, vault_settings_port, tab_store } = create_setup();
    const tab = tab_store.open_assistant_proposals_tab(
      ASSISTANT_PROPOSALS_TAB_ID,
      ASSISTANT_PROPOSALS_TAB_TITLE,
    );

    await service.save_tabs();

    const [, , state] = vault_settings_port.set_local_setting.mock
      .calls[0] as unknown as [string, string, PersistedTabState];
    expect(state.active_tab_path).toBe(tab.id);
  });
});

describe("restore_tabs for assistant_proposals tabs", () => {
  it("restores a live tab with the fixed singleton id", async () => {
    const { service, tab_store } = create_setup();

    await service.restore_tabs(
      persisted([
        { kind: "assistant_proposals", is_pinned: false, cursor: null },
      ]),
    );

    expect(tab_store.tabs).toHaveLength(1);
    expect(tab_store.tabs[0]).toMatchObject({
      kind: "assistant_proposals",
      id: ASSISTANT_PROPOSALS_TAB_ID,
      title: ASSISTANT_PROPOSALS_TAB_TITLE,
    });
  });

  it("restores the proposals tab as the active tab", async () => {
    const { service, tab_store } = create_setup();

    await service.restore_tabs(
      persisted(
        [{ kind: "assistant_proposals", is_pinned: false, cursor: null }],
        ASSISTANT_PROPOSALS_TAB_ID,
      ),
    );

    expect(tab_store.active_tab_id).toBe(ASSISTANT_PROPOSALS_TAB_ID);
  });

  it("preserves pin state and pane across a save/restore round trip", async () => {
    const { service, tab_store } = create_setup();

    await service.restore_tabs(
      persisted([
        {
          kind: "assistant_proposals",
          is_pinned: true,
          cursor: null,
          pane: "secondary",
        },
      ]),
    );

    expect(tab_store.tabs[0]).toMatchObject({
      is_pinned: true,
      pane: "secondary",
    });
  });

  it("does not open a note for an active proposals tab", async () => {
    const { service, note_service } = create_setup();

    await service.restore_tabs(
      persisted(
        [{ kind: "assistant_proposals", is_pinned: false, cursor: null }],
        ASSISTANT_PROPOSALS_TAB_ID,
      ),
    );

    expect(note_service.open_note).not.toHaveBeenCalled();
  });

  it("has no payload to validate, unlike assistant_session — the entry is never dropped", async () => {
    const { service, tab_store } = create_setup();

    await service.restore_tabs(
      persisted([
        { kind: "assistant_proposals", is_pinned: false, cursor: null },
      ]),
    );

    expect(tab_store.tabs).toHaveLength(1);
  });

  it("restores the proposals tab alongside note and graph tabs", async () => {
    const { service, tab_store } = create_setup();

    await service.restore_tabs(
      persisted([
        {
          kind: "note",
          note_path: as_note_path("docs/alpha.md"),
          is_pinned: false,
          cursor: null,
        },
        { kind: "assistant_proposals", is_pinned: false, cursor: null },
        { kind: "graph", view_mode: "vault", is_pinned: false, cursor: null },
      ]),
    );

    expect(tab_store.tabs.map((tab) => tab.kind)).toEqual([
      "note",
      "assistant_proposals",
      "graph",
    ]);
  });
});
