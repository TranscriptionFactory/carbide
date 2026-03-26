import type { MetadataStore } from "../state/metadata_store.svelte";
import type { EditorStore } from "$lib/features/editor";
import { extract_metadata } from "../domain/extract_metadata";

export class MetadataService {
  constructor(
    private readonly store: MetadataStore,
    private readonly editor_store: EditorStore,
  ) {}

  refresh(note_path: string) {
    const open_note = this.editor_store.open_note;
    if (!open_note || open_note.meta.path !== note_path) {
      this.clear();
      return;
    }

    this.store.set_loading(true);
    try {
      const metadata = extract_metadata(open_note.markdown);
      this.store.set_metadata(note_path, metadata.properties, metadata.tags);
    } catch (e) {
      this.store.set_error(e instanceof Error ? e.message : String(e));
    } finally {
      this.store.set_loading(false);
    }
  }

  clear() {
    this.store.clear();
  }
}
