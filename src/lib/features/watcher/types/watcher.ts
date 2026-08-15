/** Filesystem event emitted by the Rust watcher backend via Tauri event subscription. */
export type VaultFsEvent =
  | {
      type: "note_changed_externally";
      vault_id: string;
      note_path: string;
      // Hand-mirrored from VaultFsEvent in
      // src-tauri/src/features/watcher/service.rs — not generated, keep in sync.
      // null when the file could not be stat'd.
      mtime_ms: number | null;
    }
  | {
      type: "note_added";
      vault_id: string;
      note_path: string;
      // Carried for the same reason as note_changed_externally's: the Create
      // ending an atomic self-write is only distinguishable from an external
      // one by the mtime it reports. null when the file could not be stat'd.
      mtime_ms: number | null;
    }
  | {
      type: "note_removed";
      vault_id: string;
      note_path: string;
    }
  | {
      type: "asset_changed";
      vault_id: string;
      asset_path: string;
    }
  | {
      type: "folder_created";
      vault_id: string;
      folder_path: string;
    }
  | {
      type: "folder_removed";
      vault_id: string;
      folder_path: string;
    };
