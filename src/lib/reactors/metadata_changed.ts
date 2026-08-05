import { listen } from "@tauri-apps/api/event";

// TS mirror of the Rust MetadataChangedEvent enum
// (src-tauri/src/features/notes/service.rs). Upserts are emitted by the DB
// writer after the index commit; create/rename/delete emit from the notes
// service. Keep this the only hand-written copy.
export type MetadataChangedPayload = {
  event_type: "upsert" | "rename" | "delete";
  vault_id: string;
  path: string;
  old_path?: string;
};

export const METADATA_REFRESH_DEBOUNCE_MS = 200;

// Owns the unlisten race: disposal before the listen promise resolves must
// still tear the subscription down.
export function subscribe_metadata_changed(
  handler: (payload: MetadataChangedPayload) => void,
): () => void {
  let unlisten_fn: (() => void) | null = null;
  let is_disposed = false;

  void listen<MetadataChangedPayload>("metadata-changed", (event) => {
    if (is_disposed) return;
    handler(event.payload);
  }).then((fn) => {
    if (is_disposed) {
      fn();
    } else {
      unlisten_fn = fn;
    }
  });

  return () => {
    is_disposed = true;
    if (unlisten_fn) {
      unlisten_fn();
      unlisten_fn = null;
    }
  };
}
