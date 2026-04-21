import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_welcome_actions } from "$lib/app/orchestration/welcome_actions";
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

function create_stores() {
  return {
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
}

describe("register_welcome_actions", () => {
  it("welcome_open sets welcome_dialog.open to true", async () => {
    const registry = new ActionRegistry();
    const stores = create_stores();
    const mark_welcome_seen = vi.fn();

    register_welcome_actions({
      registry,
      stores,
      services: {
        settings: { mark_welcome_seen },
      },
    } as never);

    expect(stores.ui.welcome_dialog.open).toBe(false);
    await registry.execute(ACTION_IDS.welcome_open);
    expect(stores.ui.welcome_dialog.open).toBe(true);
  });

  it("welcome_close sets welcome_dialog.open to false and calls mark_welcome_seen", async () => {
    const registry = new ActionRegistry();
    const stores = create_stores();
    const mark_welcome_seen = vi.fn().mockResolvedValue(undefined);

    register_welcome_actions({
      registry,
      stores,
      services: {
        settings: { mark_welcome_seen },
      },
    } as never);

    stores.ui.welcome_dialog = { open: true };
    await registry.execute(ACTION_IDS.welcome_close);

    expect(stores.ui.welcome_dialog.open).toBe(false);
    expect(mark_welcome_seen).toHaveBeenCalledOnce();
  });
});
