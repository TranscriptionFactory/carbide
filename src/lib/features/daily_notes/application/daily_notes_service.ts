import type { NotesPort } from "$lib/features/note";
import type { VaultStore } from "$lib/features/vault";
import type { NotesStore } from "$lib/features/note";
import { daily_note_path } from "$lib/features/daily_notes/domain/daily_note_path";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

function format_date_iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function build_daily_frontmatter(title: string, now_ms: number): string {
  const date = format_date_iso(now_ms);
  return `---\ntitle: "${title}"\ndate_created: ${date}\n---\n\n`;
}

export class DailyNotesService {
  constructor(
    private notes_port: NotesPort,
    private vault_store: VaultStore,
    private notes_store: NotesStore,
    private now_ms: () => number,
  ) {}

  async ensure_daily_note(
    folder: string,
    name_format: string,
    date: Date,
  ): Promise<string | null> {
    const vault = this.vault_store.vault;
    if (!vault) return null;

    const path = daily_note_path(folder, name_format, date);
    const existing = this.notes_store.notes.find((n) => n.path === path);
    if (existing) return path;

    try {
      await this.notes_port.create_folder(vault.id, "", folder);
    } catch {
      // folder may already exist
    }
    try {
      await this.notes_port.create_folder(vault.id, folder, String(date.getFullYear()));
    } catch {
      // folder may already exist
    }

    const title = path.replace(/\.md$/, "").split("/").pop() ?? "";
    const markdown = build_daily_frontmatter(title, this.now_ms());
    const note = await this.notes_port.create_note(
      vault.id,
      as_note_path(path),
      as_markdown_text(markdown),
    );
    this.notes_store.add_note(note);

    return path;
  }
}
