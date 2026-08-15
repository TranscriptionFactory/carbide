import type { ActionRegistrationInput } from "$lib/app";
import { resolve_agent_note_sync } from "$lib/features/assistant/domain/agent_note_sync";
import { as_note_path, type NotePath } from "$lib/shared/types/ids";
import { paths_equal_ignore_case } from "$lib/shared/utils/path";

export type NoteSyncInput = Pick<
  ActionRegistrationInput,
  "stores" | "services"
>;

// Mutating tools include delete_note and rename_note, so a "changed" path may
// no longer exist. Disk is the only reliable witness — the tool name does not
// say which of its paths survived — so reopen and clean up on not_found the
// same way the watcher's note_removed branch does.
async function reload_open_note(input: NoteSyncInput, note_path: NotePath) {
  const { stores, services } = input;
  stores.tab.invalidate_cache_by_path(note_path);
  services.editor.close_buffer(note_path);
  const result = await services.note.open_note(note_path, false, {
    force_reload: true,
    cleanup_if_missing: true,
  });
  if (result.status === "not_found") {
    services.note.clear_open_note();
    services.tab.remove_tab(note_path);
  }
}

function find_background_tab(input: NoteSyncInput, note_path: NotePath) {
  const tab = input.stores.tab.find_tab_by_path(note_path);
  if (!tab || tab.id === input.stores.tab.active_tab_id) return null;
  return { is_dirty: tab.is_dirty };
}

// The written bytes are not threaded through this call, so disk is asked
// directly. Only for the note that is actually open: that is the one case
// where the answer changes the decision, and the read costs one IPC round
// trip against a conflict card the user would have to dismiss by hand.
async function read_disk_state(
  input: NoteSyncInput,
  note_path: NotePath,
): Promise<{ markdown: string; mtime_ms: number | null } | null> {
  const vault_id = input.stores.vault.active_vault_id;
  if (!vault_id) return null;
  try {
    const doc = await input.services.note.read_note(vault_id, note_path);
    return { markdown: String(doc.markdown), mtime_ms: doc.meta.mtime_ms };
  } catch {
    return null;
  }
}

// Every producer that writes a note behind the editor's back — the agent
// runner's tool calls and the proposal review centre's accept — closes the
// loop here, on one policy. A second policy would let the two paths disagree
// about the dirty-buffer case, which is the one that loses work.
export async function sync_changed_notes(
  input: NoteSyncInput,
  paths: string[],
): Promise<void> {
  const { stores, services } = input;
  for (const path of paths) {
    const note_path = as_note_path(path);
    const open_note = stores.editor.open_note;
    const is_open =
      open_note !== null &&
      paths_equal_ignore_case(path, String(open_note.meta.path));
    const disk = is_open ? await read_disk_state(input, note_path) : null;

    const decision = resolve_agent_note_sync(
      path,
      open_note && {
        path: open_note.meta.path,
        is_dirty: open_note.is_dirty,
        matches_disk: disk !== null && disk.markdown === open_note.markdown,
      },
      find_background_tab(input, note_path),
    );

    switch (decision) {
      case "reload":
        await reload_open_note(input, note_path);
        break;
      case "mark_saved":
        if (open_note) {
          stores.editor.mark_clean(
            open_note.meta.id,
            disk?.mtime_ms ?? undefined,
          );
        }
        break;
      case "mark_conflict":
        services.tab.mark_conflict(note_path);
        break;
      case "invalidate_tab_cache":
        services.tab.invalidate_cache(note_path);
        break;
      case "ignore":
        break;
    }
  }
}
