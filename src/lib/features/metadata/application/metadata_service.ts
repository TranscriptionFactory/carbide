import type { MetadataStore } from "../state/metadata_store.svelte";
import type { EditorStore, EditorService } from "$lib/features/editor";
import type { MetadataPort } from "../ports";
import { extract_metadata } from "../domain/extract_metadata";
import {
  add_frontmatter_property,
  remove_frontmatter_property,
  update_frontmatter_property,
} from "../domain/frontmatter_writer";
import { find_standard_field } from "../domain/standard_fields";
import { as_markdown_text } from "$lib/shared/types/ids";

export class MetadataService {
  constructor(
    private readonly store: MetadataStore,
    private readonly editor_store: EditorStore,
    private readonly editor_service: EditorService,
    private readonly port: MetadataPort,
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

  async load_suggestions(vault_id: string) {
    const registry = await this.port.list_properties(vault_id);
    this.store.set_property_registry(registry);
  }

  add_property(key: string, value: string) {
    this.write_markdown((markdown) =>
      add_frontmatter_property(markdown, key, coerce_value(key, value)),
    );
  }

  update_property(key: string, value: string) {
    this.write_markdown((markdown) =>
      update_frontmatter_property(markdown, key, coerce_value(key, value)),
    );
  }

  remove_property(key: string) {
    this.write_markdown((markdown) =>
      remove_frontmatter_property(markdown, key),
    );
  }

  clear() {
    this.store.clear();
  }

  private write_markdown(transform: (markdown: string) => string) {
    const open_note = this.editor_store.open_note;
    if (!open_note) return;

    const new_markdown = transform(open_note.markdown);
    if (new_markdown === open_note.markdown) return;

    const note_id = open_note.meta.id;
    this.editor_service.sync_visual_from_markdown_undoable(new_markdown);
    this.editor_store.set_markdown(note_id, as_markdown_text(new_markdown));
    this.editor_store.set_dirty(note_id, true);
    this.refresh(open_note.meta.path);
  }
}

function coerce_value(key: string, value: string): string | string[] {
  const type = find_standard_field(key)?.type;
  if (type === "tags" || type === "array") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return value;
}
