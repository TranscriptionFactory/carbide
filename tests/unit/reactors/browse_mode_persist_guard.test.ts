import { describe, expect, it, vi, beforeEach } from "vitest";
import { flushSync } from "svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { create_starred_persist_reactor } from "$lib/reactors/starred_persist.reactor.svelte";
import { create_recent_notes_persist_reactor } from "$lib/reactors/recent_notes_persist.reactor.svelte";
import { create_tab_persist_reactor } from "$lib/reactors/tab_persist.reactor.svelte";
import { create_test_vault } from "../helpers/test_fixtures";
import type { VaultService } from "$lib/features/vault";
import type { TabService } from "$lib/features/tab";

describe("browse mode persist guards", () => {
  let vault_store: VaultStore;
  let notes_store: NotesStore;
  let tab_store: TabStore;

  beforeEach(() => {
    vault_store = new VaultStore();
    notes_store = new NotesStore();
    tab_store = new TabStore();
    vi.useFakeTimers();
  });

  it("starred_persist skips saving when vault is in browse mode", () => {
    const save_starred = vi.fn().mockResolvedValue(undefined);
    const vault_service = {
      save_starred_paths: save_starred,
    } as unknown as VaultService;

    vault_store.set_vault(create_test_vault({ mode: "browse" }));

    const cleanup = create_starred_persist_reactor(
      notes_store,
      vault_store,
      vault_service,
    );

    flushSync();
    notes_store.set_starred_paths(["some/path.md"]);
    flushSync();
    vi.advanceTimersByTime(500);

    expect(save_starred).not.toHaveBeenCalled();
    cleanup();
  });

  it("recent_notes_persist skips saving when vault is in browse mode", () => {
    const save_recent = vi.fn().mockResolvedValue(undefined);
    const vault_service = {
      save_recent_notes: save_recent,
    } as unknown as VaultService;

    vault_store.set_vault(create_test_vault({ mode: "browse" }));

    const cleanup = create_recent_notes_persist_reactor(
      notes_store,
      vault_store,
      vault_service,
    );

    flushSync();
    notes_store.set_recent_notes([]);
    flushSync();
    vi.advanceTimersByTime(1100);

    expect(save_recent).not.toHaveBeenCalled();
    cleanup();
  });

  it("tab_persist skips saving when vault is in browse mode", () => {
    const save_tabs = vi.fn().mockResolvedValue(undefined);
    const tab_service = {
      save_tabs: save_tabs,
    } as unknown as TabService;

    vault_store.set_vault(create_test_vault({ mode: "browse" }));

    const cleanup = create_tab_persist_reactor(
      tab_store,
      vault_store,
      tab_service,
    );

    flushSync();
    vi.advanceTimersByTime(1100);

    expect(save_tabs).not.toHaveBeenCalled();
    cleanup();
  });
});
