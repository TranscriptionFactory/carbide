import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_tab_actions } from "$lib/features/tab/application/tab_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { BasesStore } from "$lib/features/bases/state/bases_store.svelte";
import { TaskStore } from "$lib/features/task/state/task_store.svelte";
import { GraphStore } from "$lib/features/graph";
import { OutlineStore } from "$lib/features/outline";
import { ParsedNoteCache } from "$lib/features/note/state/parsed_note_cache.svelte";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { NotePath } from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { create_test_vault } from "../helpers/test_fixtures";

const { tauri_invoke_mock } = vi.hoisted(() => ({
  tauri_invoke_mock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/shared/adapters/tauri_invoke", () => ({
  tauri_invoke: tauri_invoke_mock,
}));

function np(path: string): NotePath {
  return as_note_path(path);
}

function mock_open_note(path: string, is_dirty: boolean): OpenNoteState {
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path,
      title: path.replace(".md", ""),
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
    },
    markdown: as_markdown_text(""),
    buffer_id: path,
    is_dirty,
  };
}

function create_harness() {
  const registry = new ActionRegistry();
  const stores = {
    ui: new UIStore(),
    vault: new VaultStore(),
    notes: new NotesStore(),
    editor: new EditorStore(),
    op: new OpStore(),
    search: new SearchStore(),
    tab: new TabStore(),
    git: new GitStore(),
    bases: new BasesStore(),
    task: new TaskStore(),
    graph: new GraphStore(),
    outline: new OutlineStore(),
    parsed_note_cache: new ParsedNoteCache(),
    reference: new ReferenceStore(),
  };
  stores.vault.set_vault(create_test_vault());

  const services = {
    note: {
      open_note: vi.fn().mockResolvedValue({
        status: "opened",
        selected_folder_path: "",
      }),
      save_note: vi.fn().mockResolvedValue({ status: "saved" }),
      skip_mtime_guard: vi.fn(),
      write_note_content: vi.fn().mockResolvedValue(undefined),
    },
    editor: {
      flush: vi.fn().mockReturnValue(null),
      get_scroll_fraction: vi.fn().mockReturnValue(0),
      get_cursor_markdown_offset: vi.fn().mockReturnValue(0),
      close_buffer: vi.fn(),
    },
  };

  register_tab_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
  });

  return { registry, stores, services };
}

describe("app_close_requested", () => {
  beforeEach(() => {
    tauri_invoke_mock.mockClear();
    tauri_invoke_mock.mockResolvedValue(undefined);
  });

  it("closes the window immediately when no tab is dirty", async () => {
    const { registry, stores } = create_harness();
    stores.tab.open_tab(np("a.md"), "a");

    await registry.execute(ACTION_IDS.app_close_requested);

    expect(tauri_invoke_mock).toHaveBeenCalledWith("confirm_window_close");
    expect(stores.ui.tab_close_confirm.open).toBe(false);
  });

  it("opens the quit confirm dialog instead of closing when a tab is dirty", async () => {
    const { registry, stores } = create_harness();
    stores.tab.open_tab(np("a.md"), "a");
    stores.tab.set_dirty("a.md", true);

    await registry.execute(ACTION_IDS.app_close_requested);

    expect(tauri_invoke_mock).not.toHaveBeenCalled();
    expect(stores.ui.tab_close_confirm.open).toBe(true);
    expect(stores.ui.tab_close_confirm.close_mode).toBe("quit");
    expect(stores.ui.tab_close_confirm.tab_id).toBe("a.md");
  });

  it("detects dirty editor state not yet synced to the tab store", async () => {
    const { registry, stores } = create_harness();
    stores.tab.open_tab(np("a.md"), "a");
    stores.editor.set_open_note(mock_open_note("a.md", true));

    await registry.execute(ACTION_IDS.app_close_requested);

    expect(tauri_invoke_mock).not.toHaveBeenCalled();
    expect(stores.ui.tab_close_confirm.open).toBe(true);
    expect(stores.ui.tab_close_confirm.tab_id).toBe("a.md");
  });

  it("discard closes the window without closing tabs", async () => {
    const { registry, stores } = create_harness();
    stores.tab.open_tab(np("a.md"), "a");
    stores.tab.set_dirty("a.md", true);

    await registry.execute(ACTION_IDS.app_close_requested);
    await registry.execute(ACTION_IDS.tab_confirm_close_discard);

    expect(tauri_invoke_mock).toHaveBeenCalledWith("confirm_window_close");
    expect(stores.tab.tabs).toHaveLength(1);
    expect(stores.ui.tab_close_confirm.open).toBe(false);
  });

  it("save saves the dirty tab and then closes the window", async () => {
    const { registry, stores, services } = create_harness();
    stores.tab.open_tab(np("a.md"), "a");
    stores.tab.set_dirty("a.md", true);
    stores.editor.set_open_note(mock_open_note("a.md", true));

    await registry.execute(ACTION_IDS.app_close_requested);
    await registry.execute(ACTION_IDS.tab_confirm_close_save);

    expect(services.note.save_note).toHaveBeenCalled();
    expect(tauri_invoke_mock).toHaveBeenCalledWith("confirm_window_close");
    expect(stores.tab.tabs).toHaveLength(1);
  });

  it("cancel keeps the window open", async () => {
    const { registry, stores } = create_harness();
    stores.tab.open_tab(np("a.md"), "a");
    stores.tab.set_dirty("a.md", true);

    await registry.execute(ACTION_IDS.app_close_requested);
    await registry.execute(ACTION_IDS.tab_cancel_close);

    expect(tauri_invoke_mock).not.toHaveBeenCalled();
    expect(stores.ui.tab_close_confirm.open).toBe(false);
    expect(stores.ui.tab_close_confirm.close_mode).toBe("single");
    expect(stores.tab.tabs).toHaveLength(1);
  });

  it("prompts for each dirty tab before closing the window", async () => {
    const { registry, stores } = create_harness();
    stores.tab.open_tab(np("a.md"), "a");
    stores.tab.open_tab(np("b.md"), "b");
    stores.tab.set_dirty("a.md", true);
    stores.tab.set_dirty("b.md", true);

    await registry.execute(ACTION_IDS.app_close_requested);
    expect(stores.ui.tab_close_confirm.pending_dirty_tab_ids).toEqual([
      "b.md",
    ]);

    await registry.execute(ACTION_IDS.tab_confirm_close_discard);
    expect(tauri_invoke_mock).not.toHaveBeenCalled();
    expect(stores.ui.tab_close_confirm.tab_id).toBe("b.md");

    await registry.execute(ACTION_IDS.tab_confirm_close_discard);
    expect(tauri_invoke_mock).toHaveBeenCalledWith("confirm_window_close");
    expect(stores.tab.tabs).toHaveLength(2);
  });
});
