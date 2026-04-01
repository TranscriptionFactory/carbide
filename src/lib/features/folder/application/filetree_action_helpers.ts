import { SvelteMap, SvelteSet } from "svelte/reactivity";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type {
  FolderLoadState,
  FolderPaginationState,
} from "$lib/shared/types/filetree";
import { PAGE_SIZE } from "$lib/shared/constants/pagination";
import { linked_note_to_meta } from "$lib/features/reference";
import { is_linked_note_path } from "$lib/shared/types/note";

type FiletreeState = ActionRegistrationInput["stores"]["ui"]["filetree"];

function clone_filetree(ft: FiletreeState): {
  expanded_paths: SvelteSet<string>;
  load_states: SvelteMap<string, FolderLoadState>;
  error_messages: SvelteMap<string, string>;
  pagination: SvelteMap<string, FolderPaginationState>;
} {
  return {
    expanded_paths: new SvelteSet(ft.expanded_paths),
    load_states: new SvelteMap(ft.load_states),
    error_messages: new SvelteMap(ft.error_messages),
    pagination: new SvelteMap(ft.pagination),
  };
}

export function clear_folder_filetree_state(
  input: ActionRegistrationInput,
  folder_path: string,
) {
  const cloned = clone_filetree(input.stores.ui.filetree);
  cloned.load_states.delete(folder_path);
  cloned.error_messages.delete(folder_path);
  cloned.pagination.delete(folder_path);
  input.stores.ui.filetree = cloned;
}

export function batch_clear_folder_filetree_state(
  input: ActionRegistrationInput,
  folder_paths: Iterable<string>,
) {
  const cloned = clone_filetree(input.stores.ui.filetree);
  for (const folder_path of folder_paths) {
    cloned.load_states.delete(folder_path);
    cloned.error_messages.delete(folder_path);
    cloned.pagination.delete(folder_path);
  }
  input.stores.ui.filetree = cloned;
}

export function should_load_folder(
  state: FolderLoadState | undefined,
): boolean {
  return !state || state === "unloaded" || state === "error";
}

export function set_load_state(
  input: ActionRegistrationInput,
  path: string,
  state: FolderLoadState,
  error: string | null,
) {
  const load_states = new SvelteMap(input.stores.ui.filetree.load_states);
  load_states.set(path, state);

  const error_messages = new SvelteMap(input.stores.ui.filetree.error_messages);
  if (error) {
    error_messages.set(path, error);
  } else {
    error_messages.delete(path);
  }

  input.stores.ui.filetree = {
    ...input.stores.ui.filetree,
    load_states,
    error_messages,
  };
}

export function set_pagination(
  input: ActionRegistrationInput,
  path: string,
  state: FolderPaginationState,
) {
  const pagination = new SvelteMap(input.stores.ui.filetree.pagination);
  pagination.set(path, state);
  input.stores.ui.filetree = {
    ...input.stores.ui.filetree,
    pagination,
  };
}

export function clear_folder_pagination(
  input: ActionRegistrationInput,
  path: string,
) {
  const pagination = new SvelteMap(input.stores.ui.filetree.pagination);
  pagination.delete(path);
  input.stores.ui.filetree = {
    ...input.stores.ui.filetree,
    pagination,
  };
}

export function transform_filetree_paths(
  input: ActionRegistrationInput,
  transform: (path: string) => string | null,
) {
  const filetree = input.stores.ui.filetree;

  const expanded_paths = new SvelteSet<string>();
  for (const path of filetree.expanded_paths) {
    const result = transform(path);
    if (result !== null) {
      expanded_paths.add(result);
    }
  }

  const load_states = new SvelteMap<string, FolderLoadState>();
  for (const [path, state] of filetree.load_states) {
    const result = transform(path);
    if (result !== null) {
      load_states.set(result, state);
    }
  }

  const error_messages = new SvelteMap<string, string>();
  for (const [path, message] of filetree.error_messages) {
    const result = transform(path);
    if (result !== null) {
      error_messages.set(result, message);
    }
  }

  const pagination = new SvelteMap<string, FolderPaginationState>();
  for (const [path, state] of filetree.pagination) {
    const result = transform(path);
    if (result !== null) {
      pagination.set(result, state);
    }
  }

  input.stores.ui.filetree = {
    expanded_paths,
    load_states,
    error_messages,
    pagination,
  };
}

export function remove_expanded_paths(
  input: ActionRegistrationInput,
  folder_path: string,
) {
  const prefix = `${folder_path}/`;
  transform_filetree_paths(input, (path) =>
    path === folder_path || path.startsWith(prefix) ? null : path,
  );
}

export function remap_path(
  path: string,
  old_path: string,
  new_path: string,
): string {
  if (path === old_path) {
    return new_path;
  }

  const old_prefix = `${old_path}/`;
  if (path.startsWith(old_prefix)) {
    return `${new_path}/${path.slice(old_prefix.length)}`;
  }

  return path;
}

export function remap_expanded_paths(
  input: ActionRegistrationInput,
  old_path: string,
  new_path: string,
) {
  transform_filetree_paths(input, (path) =>
    remap_path(path, old_path, new_path),
  );
}

export function remap_ui_paths_after_move(
  input: ActionRegistrationInput,
  old_path: string,
  new_path: string,
  is_folder: boolean,
) {
  if (is_folder) {
    input.stores.ui.selected_folder_path = remap_path(
      input.stores.ui.selected_folder_path,
      old_path,
      new_path,
    );
    input.stores.ui.filetree_revealed_note_path = remap_path(
      input.stores.ui.filetree_revealed_note_path,
      old_path,
      new_path,
    );
    remap_expanded_paths(input, old_path, new_path);
    return;
  }

  if (input.stores.ui.filetree_revealed_note_path === old_path) {
    input.stores.ui.filetree_revealed_note_path = new_path;
  }
}

export async function load_linked_source_folder(
  input: ActionRegistrationInput,
  folder_path: string,
): Promise<void> {
  const source_name = folder_path.replace(/^@linked\/?/, "");
  if (!source_name) return;

  const vault_id = input.stores.vault.vault?.id;
  if (!vault_id) return;

  set_load_state(input, folder_path, "loading", null);
  try {
    const sources = input.stores.reference.linked_sources;
    const source = sources.find((s) => s.name === source_name && s.enabled);
    if (!source) {
      set_load_state(input, folder_path, "loaded", null);
      return;
    }

    const notes = await input.services.reference.query_all_linked_notes();
    const source_notes = notes
      .filter((n) => n.linked_source_id === source.id)
      .map(linked_note_to_meta);

    const existing = input.stores.notes.notes.filter(
      (n) => !n.path.startsWith(`${folder_path}/`),
    );
    input.stores.notes.set_notes([...existing, ...source_notes]);
    set_load_state(input, folder_path, "loaded", null);
    set_pagination(input, folder_path, {
      loaded_count: source_notes.length,
      total_count: source_notes.length,
      load_state: "idle",
      error_message: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    set_load_state(input, folder_path, "error", msg);
  }
}

export async function inject_linked_source_folders(
  input: ActionRegistrationInput,
): Promise<void> {
  const sources = input.stores.reference.linked_sources.filter(
    (s) => s.enabled,
  );
  if (sources.length === 0) return;

  const folder_paths: string[] = ["@linked"];
  for (const source of sources) {
    folder_paths.push(`@linked/${source.name}`);
  }

  for (const path of folder_paths) {
    input.stores.notes.add_folder_path(path);
  }

  set_load_state(input, "@linked", "loaded", null);
  set_pagination(input, "@linked", {
    loaded_count: sources.length,
    total_count: sources.length,
    load_state: "idle",
    error_message: null,
  });
}

export async function load_folder(
  input: ActionRegistrationInput,
  path: string,
): Promise<void> {
  const current_state = input.stores.ui.filetree.load_states.get(path);
  if (!should_load_folder(current_state)) {
    return;
  }

  set_load_state(input, path, "loading", null);
  const generation = input.stores.vault.generation;
  const show_hidden = input.stores.ui.editor_settings.show_hidden_files;
  const result = await input.services.folder.load_folder(
    path,
    generation,
    show_hidden,
  );

  if (result.status === "loaded") {
    set_load_state(input, path, "loaded", null);
    set_pagination(input, path, {
      loaded_count: Math.min(PAGE_SIZE, result.total_count),
      total_count: result.total_count,
      load_state: "idle",
      error_message: null,
    });
    return;
  }

  if (result.status === "failed") {
    set_load_state(input, path, "error", result.error);
    clear_folder_pagination(input, path);
  }
}
