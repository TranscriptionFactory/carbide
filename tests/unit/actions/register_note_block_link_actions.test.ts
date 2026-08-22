import { describe, expect, it, vi } from "vitest";
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
import { GraphStore } from "$lib/features/graph";
import { BasesStore } from "$lib/features/bases/state/bases_store.svelte";
import { TaskStore } from "$lib/features/task/state/task_store.svelte";
import { OutlineStore } from "$lib/features/outline";
import { ParsedNoteCache } from "$lib/features/note/state/parsed_note_cache.svelte";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import {
  create_open_note_state,
  create_test_note,
  create_test_vault,
} from "../helpers/test_fixtures";

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

function create_harness(block_id: string | null = "abc123") {
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
    graph: new GraphStore(),
    bases: new BasesStore(),
    task: new TaskStore(),
    outline: new OutlineStore(),
    parsed_note_cache: new ParsedNoteCache(),
    reference: new ReferenceStore(),
  };

  stores.ui.set_editor_settings({ ...DEFAULT_EDITOR_SETTINGS });
  stores.vault.set_vault(create_test_vault());

  const editor = { ensure_block_id_at: vi.fn(() => block_id) };
  const clipboard = { copy_text: vi.fn(async () => {}) };

  const services = {
    reference: {},
    vault: {},
    note: {},
    folder: {},
    settings: {},
    search: {},
    editor,
    clipboard,
    shell: {},
    tab: {},
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

  return { registry, stores, editor, clipboard };
}

function open_note(stores: { editor: EditorStore }, id = "notes/alpha") {
  const note = create_test_note(id, "alpha");
  stores.editor.set_open_note(create_open_note_state(note, "the claim"));
}

describe("register_note_actions block link flows", () => {
  it("copies a wiki link that points at the minted block id", async () => {
    const { registry, stores, editor, clipboard } = create_harness();
    open_note(stores);

    await registry.execute(ACTION_IDS.note_copy_block_link, 42);

    expect(editor.ensure_block_id_at).toHaveBeenCalledWith(42);
    expect(clipboard.copy_text).toHaveBeenCalledWith("[[notes/alpha#^abc123]]");
  });

  it("copies the bare block id", async () => {
    const { registry, stores, editor, clipboard } = create_harness();
    open_note(stores);

    await registry.execute(ACTION_IDS.note_copy_block_id, 42);

    expect(editor.ensure_block_id_at).toHaveBeenCalledWith(42);
    expect(clipboard.copy_text).toHaveBeenCalledWith("abc123");
  });

  it("falls back to the caret block when invoked without a position", async () => {
    const { registry, stores, editor } = create_harness();
    open_note(stores);

    await registry.execute(ACTION_IDS.note_copy_block_link);

    expect(editor.ensure_block_id_at).toHaveBeenCalledWith(null);
  });

  it("writes nothing when the block cannot carry an id", async () => {
    const { registry, stores, clipboard } = create_harness(null);
    open_note(stores);

    await registry.execute(ACTION_IDS.note_copy_block_link, 42);
    await registry.execute(ACTION_IDS.note_copy_block_id, 42);

    expect(clipboard.copy_text).not.toHaveBeenCalled();
  });

  it("writes nothing when no note is open", async () => {
    const { registry, editor, clipboard } = create_harness();

    await registry.execute(ACTION_IDS.note_copy_block_link, 42);

    expect(editor.ensure_block_id_at).not.toHaveBeenCalled();
    expect(clipboard.copy_text).not.toHaveBeenCalled();
  });

  it("does not mint or copy block ids in read-only mode", async () => {
    const { registry, stores, editor, clipboard } = create_harness();
    open_note(stores);
    stores.editor.set_editor_mode("read_only");

    await registry.execute(ACTION_IDS.note_copy_block_link, 42);
    await registry.execute(ACTION_IDS.note_copy_block_id, 42);

    expect(editor.ensure_block_id_at).not.toHaveBeenCalled();
    expect(clipboard.copy_text).not.toHaveBeenCalled();
  });
});
