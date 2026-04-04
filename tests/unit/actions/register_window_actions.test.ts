import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_window_actions } from "$lib/features/window";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { ParsedNoteCache } from "$lib/features/note/state/parsed_note_cache.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { SearchStore } from "$lib/features/search/state/search_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import { OutlineStore } from "$lib/features/outline/state/outline_store.svelte";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import { BasesStore } from "$lib/features/bases/state/bases_store.svelte";
import { TaskStore } from "$lib/features/task/state/task_store.svelte";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { as_vault_id, as_vault_path } from "$lib/shared/types/ids";

function create_harness(app_target: "full" | "lite") {
  const registry = new ActionRegistry();
  const open_window = vi.fn().mockResolvedValue(undefined);
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
    graph: new GraphStore(),
    bases: new BasesStore(),
    task: new TaskStore(),
    parsed_note_cache: new ParsedNoteCache(),
    reference: new ReferenceStore(),
  };

  register_window_actions({
    app_target,
    registry,
    stores,
    services: {} as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
    window_port: { open_window },
  });

  stores.vault.set_vault({
    id: as_vault_id("vault-1"),
    name: "Vault",
    path: as_vault_path("/tmp/vault"),
    note_count: 0,
    created_at: 0,
    mode: "vault",
  });

  return { registry, open_window, stores };
}

describe("register_window_actions", () => {
  it("opens markdown files in a main window and preserves lite app target", async () => {
    const { registry, open_window } = create_harness("lite");

    await registry.execute(ACTION_IDS.window_open_viewer, "docs/readme.md");

    expect(open_window).toHaveBeenCalledWith({
      kind: "main",
      vault_path: "/tmp/vault",
      file_path: "docs/readme.md",
      app_target: "lite",
    });
  });

  it("opens non-markdown files in a viewer window and preserves full app target", async () => {
    const { registry, open_window } = create_harness("full");

    await registry.execute(ACTION_IDS.window_open_viewer, "docs/spec.pdf");

    expect(open_window).toHaveBeenCalledWith({
      kind: "viewer",
      vault_path: "/tmp/vault",
      file_path: "docs/spec.pdf",
      app_target: "full",
    });
  });

  it("opens new windows with the current app target", async () => {
    const { registry, open_window } = create_harness("lite");

    await registry.execute(ACTION_IDS.window_open_new);

    expect(open_window).toHaveBeenCalledWith({
      kind: "main",
      vault_path: "/tmp/vault",
      app_target: "lite",
    });
  });
});
