import { invoke } from "@tauri-apps/api/core";
import type { MetadataPort } from "../ports";
import type { NoteMetadata } from "../types";

export class MetadataTauriAdapter implements MetadataPort {
  async get_note_metadata(
    vaultId: string,
    path: string,
  ): Promise<NoteMetadata> {
    return invoke<NoteMetadata>("note_get_metadata", { vaultId, path });
  }
}
