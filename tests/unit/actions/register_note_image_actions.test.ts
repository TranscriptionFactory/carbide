import { afterEach, describe, expect, it, vi } from "vitest";
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
import { SttStore } from "$lib/features/stt";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import { as_note_path } from "$lib/shared/types/ids";
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
    graph: new GraphStore(),
    bases: new BasesStore(),
    task: new TaskStore(),
    outline: new OutlineStore(),
    parsed_note_cache: new ParsedNoteCache(),
    reference: new ReferenceStore(),
    stt: new SttStore(),
  };

  stores.ui.set_editor_settings({ ...DEFAULT_EDITOR_SETTINGS });
  stores.vault.set_vault(create_test_vault());

  const services = {
    reference: {},
    vault: {},
    note: {
      reset_asset_write_operation: vi.fn(),
    },
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

  return { registry, stores, services };
}

describe("register_note_actions image flows", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefills the image paste dialog with the common timestamp filename", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T14:05:00"));

    const { registry, stores, services } = create_harness();
    const note = create_test_note("notes/alpha", "alpha");
    stores.editor.set_open_note(create_open_note_state(note, "# alpha"));

    await registry.execute(ACTION_IDS.note_request_image_paste, {
      note_id: note.id,
      note_path: as_note_path("notes/alpha.md"),
      image: {
        bytes: new Uint8Array([1, 2, 3]),
        mime_type: "image/png",
        file_name: "clip.png",
      },
    });

    expect(stores.ui.image_paste_dialog.open).toBe(true);
    expect(stores.ui.image_paste_dialog.filename).toBe("2026-03-21_1405");
    expect(stores.ui.image_paste_dialog.target_folder).toBe(".assets");
    expect(services.note.reset_asset_write_operation).toHaveBeenCalledOnce();
  });
});
