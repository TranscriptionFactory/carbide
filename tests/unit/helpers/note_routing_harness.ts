import { vi } from "vitest";
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
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";
import type { NoteOpenResult } from "$lib/features/note/types/note_service_result";
import { create_test_vault } from "./test_fixtures";

function make_note(path: string): OpenNoteState {
  const name = path.split("/").pop() ?? path;
  const title = name.replace(/\.md$/, "");
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name,
      title,
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 100,
      file_type: null,
    },
    markdown: as_markdown_text(`# ${title}`),
    buffer_id: path,
    is_dirty: false,
  };
}

export function create_note_routing_harness() {
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

  const resolve_linked_note_file_path = vi
    .fn()
    .mockResolvedValue(null as string | null);

  const services = {
    reference: {
      resolve_linked_note_file_path,
    },
    vault: {},
    note: {
      open_note: vi.fn((note_path: string): Promise<NoteOpenResult> => {
        const note = make_note(note_path);
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
      resolve_wiki_link: vi.fn(),
      search_omnibar: vi.fn().mockResolvedValue({ items: [] }),
      search_notes_all_vaults: vi.fn().mockResolvedValue({ groups: [] }),
      reset_search_notes_operation: vi.fn(),
    },
    document: {
      open_document: vi.fn().mockResolvedValue(undefined),
      close_document: vi.fn(),
    },
    editor: {
      flush: vi.fn().mockReturnValue(null),
      mount: vi.fn().mockResolvedValue(undefined),
      unmount: vi.fn(),
      is_mounted: vi.fn().mockReturnValue(true),
      open_buffer: vi.fn(),
      close_buffer: vi.fn(),
      get_scroll_fraction: vi.fn().mockReturnValue(0),
      get_cursor_markdown_offset: vi.fn().mockReturnValue(0),
    },
    clipboard: {},
    shell: {
      open_url: vi.fn().mockResolvedValue(undefined),
      open_path: vi.fn().mockResolvedValue(undefined),
    },
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

  const document_open = vi.fn().mockResolvedValue(undefined);
  registry.register({
    id: ACTION_IDS.document_open,
    label: "Open Document",
    execute: document_open,
  });

  return {
    registry,
    stores,
    services,
    document_open,
    resolve_linked_note_file_path,
  };
}
