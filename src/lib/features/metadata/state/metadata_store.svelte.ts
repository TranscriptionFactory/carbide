import type { NoteProperty, NoteTag } from "../types";

export class MetadataStore {
  properties = $state<NoteProperty[]>([]);
  tags = $state<NoteTag[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  note_path = $state<string | null>(null);

  set_metadata(note_path: string, properties: NoteProperty[], tags: NoteTag[]) {
    this.note_path = note_path;
    this.properties = properties;
    this.tags = tags;
    this.error = null;
  }

  set_loading(loading: boolean) {
    this.loading = loading;
  }

  set_error(error: string | null) {
    this.error = error;
  }

  clear() {
    this.properties = [];
    this.tags = [];
    this.loading = false;
    this.error = null;
    this.note_path = null;
  }
}
