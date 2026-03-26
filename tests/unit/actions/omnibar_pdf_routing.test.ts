import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_omnibar_actions } from "$lib/features/search/application/omnibar_actions";
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
import type { OmnibarItem } from "$lib/shared/types/search";
import { as_note_path } from "$lib/shared/types/ids";

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
  };

  const services = {
    search: {
      search_omnibar: vi.fn().mockResolvedValue({ items: [] }),
      search_notes_all_vaults: vi.fn().mockResolvedValue({ groups: [] }),
      reset_search_notes_operation: vi.fn(),
    },
  };

  register_omnibar_actions({
    registry,
    stores,
    services: services as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
  } as never);

  const document_open = vi.fn().mockResolvedValue(undefined);
  const note_open = vi.fn().mockResolvedValue(undefined);

  registry.register({
    id: ACTION_IDS.document_open,
    label: "Open Document",
    execute: document_open,
  });

  registry.register({
    id: ACTION_IDS.note_open,
    label: "Open Note",
    execute: note_open,
  });

  return { registry, stores, document_open, note_open };
}

function make_note_item(path: string): OmnibarItem {
  return {
    kind: "note",
    note: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.split("/").at(-1) ?? path,
      title: path,
      mtime_ms: 0,
      size_bytes: 0,
      file_type: null,
    },
    score: 1,
    snippet: undefined,
  };
}

function make_recent_note_item(path: string): OmnibarItem {
  return {
    kind: "recent_note",
    note: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.split("/").at(-1) ?? path,
      title: path,
      mtime_ms: 0,
      size_bytes: 0,
      file_type: null,
    },
  };
}

describe("omnibar confirm_item routing", () => {
  it("routes a note item with a .pdf path to document_open", async () => {
    const { registry, document_open, note_open } = create_harness();

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_note_item("docs/report.pdf"),
    );

    expect(document_open).toHaveBeenCalledWith({
      file_path: as_note_path("docs/report.pdf"),
    });
    expect(note_open).not.toHaveBeenCalled();
  });

  it("routes a note item with no recognized document extension to note_open", async () => {
    const { registry, document_open, note_open } = create_harness();

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_note_item("docs/readme"),
    );

    expect(note_open).toHaveBeenCalledWith({
      note_path: as_note_path("docs/readme"),
      cleanup_if_missing: true,
    });
    expect(document_open).not.toHaveBeenCalled();
  });

  it("routes a recent_note item with a .pdf path to document_open", async () => {
    const { registry, document_open, note_open } = create_harness();

    await registry.execute(
      ACTION_IDS.omnibar_confirm_item,
      make_recent_note_item("archive/notes.pdf"),
    );

    expect(document_open).toHaveBeenCalledWith({
      file_path: as_note_path("archive/notes.pdf"),
    });
    expect(note_open).not.toHaveBeenCalled();
  });
});
