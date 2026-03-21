import type { NoteMetadata } from "./types";

export interface MetadataPort {
  get_note_metadata(vault_id: string, path: string): Promise<NoteMetadata>;
}
