import type { EditorStore } from "$lib/features/editor";
import { is_draft_note_path } from "$lib/features/note";

export type LspSyncCallbacks = {
  on_open: (path: string, content: string) => void;
  on_change: (path: string, content: string) => void;
  on_save?: (path: string, content: string) => void;
  on_close?: (path: string) => void;
};

export type LspSyncClientConfig = LspSyncCallbacks & {
  is_ready: () => boolean;
  debounce_ms: number;
  skip_draft?: boolean;
};

export function create_lsp_document_sync_reactor(
  editor_store: EditorStore,
  clients: LspSyncClientConfig[],
): () => void {
  return $effect.root(() => {
    for (const client of clients) {
      mount_client_effects(editor_store, client);
    }
  });
}

function mount_client_effects(
  editor_store: EditorStore,
  client: LspSyncClientConfig,
): void {
  let previous_path: string | null = null;

  $effect(() => {
    const open_note = editor_store.open_note;
    const ready = client.is_ready();

    if (!ready) {
      if (previous_path && client.on_close) {
        client.on_close(previous_path);
      }
      previous_path = null;
      return;
    }

    const current_path = open_note?.meta.path ?? null;

    if (current_path && client.skip_draft && is_draft_note_path(current_path)) {
      previous_path = current_path;
      return;
    }

    if (previous_path && previous_path !== current_path && client.on_close) {
      client.on_close(previous_path);
    }

    if (current_path && current_path !== previous_path) {
      const content = open_note?.markdown ?? "";
      client.on_open(current_path, content);
    }

    previous_path = current_path;

    return () => {
      if (previous_path && client.on_close) {
        client.on_close(previous_path);
        previous_path = null;
      }
    };
  });

  let debounce_timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const open_note = editor_store.open_note;
    if (!open_note || !client.is_ready()) return;

    const path = open_note.meta.path;
    if (client.skip_draft && is_draft_note_path(path)) return;

    const content = open_note.markdown;
    const is_dirty = open_note.is_dirty;
    if (!is_dirty) return;

    if (debounce_timer) clearTimeout(debounce_timer);
    debounce_timer = setTimeout(() => {
      client.on_change(path, content ?? "");
      debounce_timer = null;
    }, client.debounce_ms);

    return () => {
      if (debounce_timer) {
        clearTimeout(debounce_timer);
        debounce_timer = null;
      }
    };
  });

  if (client.on_save) {
    let was_dirty = false;
    const save_fn = client.on_save;

    $effect(() => {
      const open_note = editor_store.open_note;
      const is_dirty = open_note?.is_dirty ?? false;

      const just_saved = was_dirty && !is_dirty;
      was_dirty = is_dirty;

      if (!just_saved || !client.is_ready() || !open_note) return;

      const path = open_note.meta.path;
      if (client.skip_draft && is_draft_note_path(path)) return;

      save_fn(path, open_note.markdown ?? "");
    });
  }
}
