import type { NoteProperty, NoteTag, VaultProperty } from "../types";

export class MetadataStore {
  properties = $state<NoteProperty[]>([]);
  tags = $state<NoteTag[]>([]);
  property_registry = $state<VaultProperty[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  note_path = $state<string | null>(null);
  editing_key = $state<string | null>(null);
  adding = $state(false);

  set_metadata(note_path: string, properties: NoteProperty[], tags: NoteTag[]) {
    this.note_path = note_path;
    this.properties = properties;
    this.tags = tags;
    this.error = null;
  }

  set_property_registry(registry: VaultProperty[]) {
    this.property_registry = registry;
  }

  set_loading(loading: boolean) {
    this.loading = loading;
  }

  set_error(error: string | null) {
    this.error = error;
  }

  begin_add() {
    this.adding = true;
    this.editing_key = null;
  }

  begin_edit(key: string) {
    this.editing_key = key;
    this.adding = false;
  }

  cancel_edit() {
    this.editing_key = null;
    this.adding = false;
  }

  clear() {
    this.properties = [];
    this.tags = [];
    this.loading = false;
    this.error = null;
    this.note_path = null;
    this.editing_key = null;
    this.adding = false;
  }
}
