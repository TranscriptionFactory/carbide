import type { NoteProperty, NoteTag } from "../types";

export class MetadataStore {
  properties = $state<NoteProperty[]>([]);
  tags = $state<NoteTag[]>([]);
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

  set_loading(loading: boolean) {
    this.loading = loading;
  }

  set_error(error: string | null) {
    this.error = error;
  }

  add_property(key: string, value: string) {
    if (this.properties.some((p) => p.key === key)) return;
    this.properties = [...this.properties, { key, value, type: "string" }];
    this.adding = false;
  }

  update_property(key: string, value: string) {
    this.properties = this.properties.map((p) =>
      p.key === key ? { ...p, value } : p,
    );
    this.editing_key = null;
  }

  remove_property(key: string) {
    this.properties = this.properties.filter((p) => p.key !== key);
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
