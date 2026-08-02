import { describe, expect, it, vi } from "vitest";
import { TabService } from "$lib/features/tab/application/tab_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { AssistantSessionStore } from "$lib/features/assistant";
import {
  assistant_session_tab_id,
  ASSISTANT_SESSION_TAB_TITLE,
} from "$lib/features/tab/domain/assistant_session_tab";
import { as_note_path, as_vault_id } from "$lib/shared/types/ids";
import type { PersistedTabState } from "$lib/features/tab";
import { create_test_vault } from "../../helpers/test_fixtures";
import { make_session } from "../../helpers/assistant_session_fixtures";

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

describe("assistant_session tab id", () => {
  it("derives a deterministic id from the session id", () => {
    expect(assistant_session_tab_id("session-1")).toBe(
      "__assistant_session__session-1__",
    );
    expect(assistant_session_tab_id("session-1")).toBe(
      assistant_session_tab_id("session-1"),
    );
  });

  it("gives different sessions different ids", () => {
    expect(assistant_session_tab_id("a")).not.toBe(
      assistant_session_tab_id("b"),
    );
  });
});

describe("opening an assistant_session tab", () => {
  it("creates a tab carrying the session id and activates it", () => {
    const { tab_store } = create_setup();

    const tab = tab_store.open_assistant_session_tab(
      assistant_session_tab_id("s1"),
      "How do backlinks work?",
      "s1",
    );

    expect(tab.kind).toBe("assistant_session");
    expect(tab).toMatchObject({ session_id: "s1", is_dirty: false });
    expect(tab_store.active_tab_id).toBe(tab.id);
    expect(tab_store.tabs).toHaveLength(1);
  });

  it("reactivates the existing tab instead of opening a duplicate", () => {
    const { tab_store } = create_setup();
    const id = assistant_session_tab_id("s1");

    const first = tab_store.open_assistant_session_tab(id, "First", "s1");
    const second = tab_store.open_assistant_session_tab(id, "Second", "s1");

    expect(tab_store.tabs).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(tab_store.active_tab_id).toBe(first.id);
  });
});

describe("assistant_session tab persistence", () => {
  it("persists the session id with a null cursor", async () => {
    const { service, vault_settings_port, tab_store } = create_setup();
    tab_store.open_assistant_session_tab(
      assistant_session_tab_id("s1"),
      "How do backlinks work?",
      "s1",
    );

    await service.save_tabs();

    const [, , state] = vault_settings_port.set_local_setting.mock
      .calls[0] as unknown as [string, string, PersistedTabState];
    expect(state.tabs).toEqual([
      {
        kind: "assistant_session",
        session_id: "s1",
        is_pinned: false,
        cursor: null,
      },
    ]);
  });

  it("records the assistant tab as the active tab", async () => {
    const { service, vault_settings_port, tab_store } = create_setup();
    const tab = tab_store.open_assistant_session_tab(
      assistant_session_tab_id("s1"),
      "How do backlinks work?",
      "s1",
    );

    await service.save_tabs();

    const [, , state] = vault_settings_port.set_local_setting.mock
      .calls[0] as unknown as [string, string, PersistedTabState];
    expect(state.active_tab_path).toBe(tab.id);
  });
});

describe("restore_tabs for assistant_session tabs", () => {
  it("restores a live tab pointing at the same session id", async () => {
    const { service, tab_store } = create_setup();

    await service.restore_tabs(
      persisted([
        {
          kind: "assistant_session",
          session_id: "s1",
          is_pinned: false,
          cursor: null,
        },
      ]),
    );

    expect(tab_store.tabs).toHaveLength(1);
    expect(tab_store.tabs[0]).toMatchObject({
      kind: "assistant_session",
      session_id: "s1",
      id: assistant_session_tab_id("s1"),
    });
  });

  it("restores the assistant tab as the active tab", async () => {
    const { service, tab_store } = create_setup();
    const tab_id = assistant_session_tab_id("s1");

    await service.restore_tabs(
      persisted(
        [
          {
            kind: "assistant_session",
            session_id: "s1",
            is_pinned: false,
            cursor: null,
          },
        ],
        tab_id,
      ),
    );

    expect(tab_store.active_tab_id).toBe(tab_id);
  });

  it("preserves pin state and pane across a save/restore round trip", async () => {
    const { service, tab_store } = create_setup();

    await service.restore_tabs(
      persisted([
        {
          kind: "assistant_session",
          session_id: "s1",
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

  it("does not open a note for an active assistant tab", async () => {
    const { service, note_service } = create_setup();

    await service.restore_tabs(
      persisted(
        [
          {
            kind: "assistant_session",
            session_id: "s1",
            is_pinned: false,
            cursor: null,
          },
        ],
        assistant_session_tab_id("s1"),
      ),
    );

    expect(note_service.open_note).not.toHaveBeenCalled();
  });

  it("drops a persisted entry with no usable session id", async () => {
    const { service, tab_store } = create_setup();

    await service.restore_tabs(
      persisted([
        {
          kind: "assistant_session",
          session_id: "",
          is_pinned: false,
          cursor: null,
        },
      ]),
    );

    expect(tab_store.tabs).toHaveLength(0);
  });

  it("keeps the tab when the session was pruned from the store", async () => {
    const { service, tab_store } = create_setup();
    const session_store = new AssistantSessionStore();
    session_store.sessions = [make_session({ id: "still-here" })];

    await expect(
      service.restore_tabs(
        persisted([
          {
            kind: "assistant_session",
            session_id: "pruned",
            is_pinned: false,
            cursor: null,
          },
        ]),
      ),
    ).resolves.toBeUndefined();

    expect(session_store.get("pruned")).toBeNull();
    expect(tab_store.tabs).toHaveLength(1);
    expect(tab_store.tabs[0]).toMatchObject({
      kind: "assistant_session",
      session_id: "pruned",
      title: ASSISTANT_SESSION_TAB_TITLE,
    });
  });

  it("restores assistant tabs alongside note and graph tabs", async () => {
    const { service, tab_store } = create_setup();

    await service.restore_tabs(
      persisted([
        {
          kind: "note",
          note_path: as_note_path("docs/alpha.md"),
          is_pinned: false,
          cursor: null,
        },
        {
          kind: "assistant_session",
          session_id: "s1",
          is_pinned: false,
          cursor: null,
        },
        { kind: "graph", view_mode: "vault", is_pinned: false, cursor: null },
      ]),
    );

    expect(tab_store.tabs.map((tab) => tab.kind)).toEqual([
      "note",
      "assistant_session",
      "graph",
    ]);
  });
});
