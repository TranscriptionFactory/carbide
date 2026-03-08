import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_note_actions } from "$lib/features/note/application/note_actions";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import { SplitViewStore } from "$lib/features/split_view";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import {
  as_markdown_text,
  as_note_path,
  as_vault_id,
} from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { Vault } from "$lib/shared/types/vault";
import type { NoteOpenResult } from "$lib/features/note/types/note_service_result";

vi.mock("svelte-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn().mockReturnValue("toast-id"),
    dismiss: vi.fn(),
  },
}));

function make_note(path: string): OpenNoteState {
  const name = path.split("/").pop() ?? path;
  const title = name.replace(/\.md$/, "");
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name,
      title,
      mtime_ms: 0,
      size_bytes: 100,
    },
    markdown: as_markdown_text(`# ${title}`),
    buffer_id: path,
    is_dirty: false,
  };
}

function make_vault(
  id = "vault1",
  path = "/vaults/v1",
  mode: "vault" | "browse" = "browse",
): Vault {
  return {
    id: as_vault_id(id),
    name: id,
    path,
    note_count: 0,
    created_at: 0,
    mode,
  } as Vault;
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
    outline: new OutlineStore(),
    split_view: new SplitViewStore(),
  };

  stores.ui.set_editor_settings({ ...DEFAULT_EDITOR_SETTINGS });

  const open_note_results = new Map<string, OpenNoteState>();

  const services = {
    vault: {},
    note: {
      open_note: vi.fn((note_path: string): Promise<NoteOpenResult> => {
        const note = open_note_results.get(note_path) ?? make_note(note_path);
        open_note_results.set(note_path, note);
        stores.editor.set_open_note(note);
        stores.notes.add_note(note.meta);
        return Promise.resolve({
          status: "opened" as const,
          selected_folder_path: note_path.includes("/")
            ? note_path.substring(0, note_path.lastIndexOf("/"))
            : "",
        });
      }),
      save_note: vi.fn().mockResolvedValue({ status: "saved" }),
      write_note_content: vi.fn().mockResolvedValue(undefined),
      create_new_note: vi.fn(),
    },
    folder: {},
    settings: {},
    search: {
      resolve_note_link: vi.fn(),
    },
    editor: {
      flush: vi.fn().mockReturnValue(null),
      mount: vi.fn().mockResolvedValue(undefined),
      unmount: vi.fn(),
      is_mounted: vi.fn().mockReturnValue(true),
      open_buffer: vi.fn(),
      close_buffer: vi.fn(),
      get_scroll_top: vi.fn().mockReturnValue(0),
    },
    clipboard: {},
    shell: {},
    tab: {
      load_tabs: vi.fn().mockResolvedValue(null),
      restore_tabs: vi.fn().mockResolvedValue(undefined),
      persist_tabs: vi.fn().mockResolvedValue(undefined),
    },
    git: {},
    hotkey: {},
    theme: {},
  };

  register_note_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
  });

  return { registry, stores, services, open_note_results };
}

describe("note_open in browse window context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a tab when opening the first note", async () => {
    const { registry, stores, services } = create_harness();
    stores.vault.set_vault(make_vault());

    await registry.execute(ACTION_IDS.note_open, "cheatsheets/bash.md");

    expect(services.note.open_note).toHaveBeenCalledWith(
      "cheatsheets/bash.md",
      false,
      { cleanup_if_missing: false },
    );
    expect(stores.tab.tabs).toHaveLength(1);
    const tab0 = stores.tab.tabs[0];
    expect(tab0?.kind === "note" && tab0.note_path).toBe("cheatsheets/bash.md");
    expect(stores.tab.active_tab_id).toBe("cheatsheets/bash.md");
    expect(stores.editor.open_note?.meta.path).toBe(
      as_note_path("cheatsheets/bash.md"),
    );
  });

  it("creates a second tab when opening another note", async () => {
    const { registry, stores } = create_harness();
    stores.vault.set_vault(make_vault());

    await registry.execute(ACTION_IDS.note_open, "cheatsheets/bash.md");
    expect(stores.tab.tabs).toHaveLength(1);

    await registry.execute(ACTION_IDS.note_open, "cheatsheets/git.md");
    expect(stores.tab.tabs).toHaveLength(2);
    expect(stores.tab.active_tab_id).toBe("cheatsheets/git.md");
    expect(stores.editor.open_note?.meta.path).toBe(
      as_note_path("cheatsheets/git.md"),
    );
  });

  it("does not open note when vault is null (when guard)", async () => {
    const { registry, stores, services } = create_harness();
    // vault NOT set — when_vault_open should block

    await registry.execute(ACTION_IDS.note_open, "cheatsheets/bash.md");

    expect(services.note.open_note).not.toHaveBeenCalled();
    expect(stores.tab.tabs).toHaveLength(0);
  });

  it("reuses existing tab when opening same note again", async () => {
    const { registry, stores } = create_harness();
    stores.vault.set_vault(make_vault());

    await registry.execute(ACTION_IDS.note_open, "cheatsheets/bash.md");
    await registry.execute(ACTION_IDS.note_open, "cheatsheets/bash.md");

    expect(stores.tab.tabs).toHaveLength(1);
  });

  it("handles note_open with object payload (from execute_app_mounted)", async () => {
    const { registry, stores, services } = create_harness();
    stores.vault.set_vault(make_vault());

    await registry.execute(ACTION_IDS.note_open, {
      note_path: as_note_path("cheatsheets/bash.md"),
      cleanup_if_missing: false,
    });

    expect(services.note.open_note).toHaveBeenCalled();
    expect(stores.tab.tabs).toHaveLength(1);
    const tab0 = stores.tab.tabs[0];
    expect(tab0?.kind === "note" && tab0.note_path).toBe("cheatsheets/bash.md");
  });

  it("opens multiple notes sequentially in browse window", async () => {
    const { registry, stores } = create_harness();
    stores.vault.set_vault(make_vault());

    const paths = ["notes/a.md", "notes/b.md", "notes/c.md"];

    for (const path of paths) {
      await registry.execute(ACTION_IDS.note_open, path);
    }

    expect(stores.tab.tabs).toHaveLength(3);
    expect(stores.tab.active_tab_id).toBe("notes/c.md");
    expect(stores.editor.open_note?.meta.path).toBe(as_note_path("notes/c.md"));
  });
});
