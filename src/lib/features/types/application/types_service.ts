import type { VaultId, NotePath } from "$lib/shared/types/ids";
import type { MarkdownText, NoteId } from "$lib/shared/types/ids";
import type { NotesPort } from "$lib/features/note";
import { update_frontmatter_property } from "$lib/features/metadata";
import {
  TYPE_DEFINITION_MARKER,
  type TypeDefinition,
  type TypesPort,
} from "../ports";
import type { TypesStore } from "../state/types_store.svelte";
import { parse_type_definition } from "../domain/type_definition";

function type_note_path(name: string): NotePath {
  return `${name}.md` as NotePath;
}

function type_template(name: string): MarkdownText {
  return `---\ntype: ${TYPE_DEFINITION_MARKER}\nlabel: ${name}\nvisible: true\n---\n\n# ${name}\n` as MarkdownText;
}

export class TypesService {
  private revision = 0;

  constructor(
    private port: TypesPort,
    private notes_port: NotesPort,
    private store: TypesStore,
  ) {}

  async refresh(vault_id: VaultId): Promise<void> {
    const revision = ++this.revision;
    this.store.loading = true;
    this.store.error = null;
    try {
      const [backend_types, definition_notes] = await Promise.all([
        this.port.list_types(vault_id),
        this.port.list_definition_notes(vault_id),
      ]);
      if (revision !== this.revision) return;

      const definitions = await this.parse_definitions(
        vault_id,
        definition_notes,
      );
      if (revision !== this.revision) return;

      this.store.set_backend_types(backend_types);
      this.store.set_definitions(definitions);
    } catch (e) {
      if (revision !== this.revision) return;
      this.store.error = String(e);
    } finally {
      if (revision === this.revision) this.store.loading = false;
    }
  }

  private async parse_definitions(
    vault_id: VaultId,
    notes: { path: string; title: string; name: string }[],
  ): Promise<TypeDefinition[]> {
    const parsed = await Promise.all(
      notes.map(async (note) => {
        const name = note.title.trim() || note.name;
        const doc = await this.notes_port.read_note(
          vault_id,
          note.path as NoteId,
        );
        return parse_type_definition(name, note.path, doc.markdown);
      }),
    );
    return parsed;
  }

  async create(vault_id: VaultId, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await this.notes_port.create_note(
        vault_id,
        type_note_path(trimmed),
        type_template(trimmed),
      );
      await this.refresh(vault_id);
    } catch (e) {
      this.store.error = String(e);
    }
  }

  async set_property(
    vault_id: VaultId,
    definition_path: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    try {
      const note_id = definition_path as NoteId;
      const doc = await this.notes_port.read_note(vault_id, note_id);
      const next = update_frontmatter_property(doc.markdown, key, value);
      await this.notes_port.write_and_index_note(
        vault_id,
        note_id,
        next as MarkdownText,
        doc.meta.mtime_ms,
      );
      await this.refresh(vault_id);
    } catch (e) {
      this.store.error = String(e);
    }
  }
}
