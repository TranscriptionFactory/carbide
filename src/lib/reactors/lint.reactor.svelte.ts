import type { VaultStore } from "$lib/features/vault";
import type { EditorStore, EditorService } from "$lib/features/editor";
import type { LintStore, LintService } from "$lib/features/lint";
import { apply_lint_text_edits } from "$lib/features/lint";
import type { UIStore } from "$lib/app";
import type { NoteService } from "$lib/features/note";
import type { NoteId } from "$lib/shared/types/ids";
import { as_markdown_text } from "$lib/shared/types/ids";

export function create_lint_reactor(
  vault_store: VaultStore,
  editor_store: EditorStore,
  lint_store: LintStore,
  lint_service: LintService,
  ui_store: UIStore,
  note_service: NoteService,
  editor_service: EditorService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const vault = vault_store.vault;
      if (!vault) {
        void lint_service.stop();
        return;
      }

      const settings_loaded = ui_store.editor_settings_loaded;
      if (!settings_loaded) return;

      const lint_enabled = ui_store.editor_settings.lint_enabled;
      if (!lint_enabled) {
        void lint_service.stop();
        return;
      }

      const user_overrides =
        vault.mode === "browse" ? "" : ui_store.editor_settings.lint_rules_toml;
      void lint_service.start(
        vault.id,
        vault.path,
        user_overrides,
        vault.mode === "browse",
      );

      return () => {
        void lint_service.stop();
      };
    });

    let was_dirty = false;
    let skip_next_format = false;

    $effect(() => {
      const open_note = editor_store.open_note;
      const is_running = lint_store.is_running;
      const format_on_save = ui_store.editor_settings.lint_format_on_save;
      const formatter = ui_store.editor_settings.lint_formatter;
      const is_dirty = open_note?.is_dirty ?? false;

      const just_saved = was_dirty && !is_dirty;
      was_dirty = is_dirty;

      if (!just_saved || !is_running || !format_on_save || !open_note) return;

      if (skip_next_format) {
        skip_next_format = false;
        return;
      }

      const path = open_note.meta.path;
      const note_id = open_note.meta.id as NoteId;
      const current = open_note.markdown ?? "";

      void lint_service.format_file(path, current, formatter).then((edits) => {
        if (edits.length === 0) return;
        if (editor_store.open_note?.meta.id !== note_id) return;
        const formatted = apply_lint_text_edits(current, edits);
        if (formatted === current) return;

        skip_next_format = true;
        editor_store.set_markdown(note_id, as_markdown_text(formatted));
        editor_service.sync_visual_from_markdown(formatted);
        editor_store.set_dirty(note_id, true);

        void lint_service.notify_file_changed(path, formatted);
        void note_service.save_note(null, true);
      });
    });
  });
}
