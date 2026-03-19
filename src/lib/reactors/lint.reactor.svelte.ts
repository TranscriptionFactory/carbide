import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";
import type { LintStore, LintService } from "$lib/features/lint";
import { apply_lint_text_edits } from "$lib/features/lint";
import type { UIStore } from "$lib/app";
import type { NoteId } from "$lib/shared/types/ids";
import { as_markdown_text } from "$lib/shared/types/ids";

export function create_lint_reactor(
  vault_store: VaultStore,
  editor_store: EditorStore,
  lint_store: LintStore,
  lint_service: LintService,
  ui_store: UIStore,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const vault = vault_store.vault;
      if (!vault) {
        void lint_service.stop();
        return;
      }

      const lint_enabled = ui_store.editor_settings.lint_enabled;
      if (!lint_enabled) {
        void lint_service.stop();
        return;
      }

      const user_overrides = ui_store.editor_settings.lint_rules_toml;
      void lint_service.start(vault.id, vault.path, user_overrides);

      return () => {
        void lint_service.stop();
      };
    });

    let previous_file_path: string | null = null;

    $effect(() => {
      const open_note = editor_store.open_note;
      const is_running = lint_store.is_running;

      if (!is_running) {
        previous_file_path = null;
        lint_store.set_active_file(null);
        return;
      }

      const current_path = open_note?.meta.path ?? null;
      lint_store.set_active_file(current_path);

      if (previous_file_path && previous_file_path !== current_path) {
        void lint_service.notify_file_closed(previous_file_path);
      }

      if (current_path && current_path !== previous_file_path) {
        const content = open_note?.markdown ?? "";
        void lint_service.notify_file_opened(current_path, content);
      }

      previous_file_path = current_path;

      return () => {
        if (previous_file_path) {
          void lint_service.notify_file_closed(previous_file_path);
          previous_file_path = null;
        }
      };
    });

    let debounce_timer: ReturnType<typeof setTimeout> | null = null;

    $effect(() => {
      const open_note = editor_store.open_note;
      const is_running = lint_store.is_running;

      if (!open_note || !is_running) return;

      const path = open_note.meta.path;
      const content = open_note.markdown;
      const is_dirty = open_note.is_dirty;

      if (!is_dirty) return;

      if (debounce_timer) clearTimeout(debounce_timer);
      debounce_timer = setTimeout(() => {
        void lint_service.notify_file_changed(path, content ?? "");
        debounce_timer = null;
      }, 300);

      return () => {
        if (debounce_timer) {
          clearTimeout(debounce_timer);
          debounce_timer = null;
        }
      };
    });

    let was_dirty = false;

    $effect(() => {
      const open_note = editor_store.open_note;
      const is_running = lint_store.is_running;
      const format_on_save = ui_store.editor_settings.lint_format_on_save;
      const is_dirty = open_note?.is_dirty ?? false;

      const just_saved = was_dirty && !is_dirty;
      was_dirty = is_dirty;

      if (!just_saved || !is_running || !format_on_save || !open_note) return;

      const path = open_note.meta.path;
      const note_id = open_note.meta.id as NoteId;
      const current = open_note.markdown ?? "";

      void lint_service.format_file(path).then((edits) => {
        if (edits.length === 0) return;
        const formatted = apply_lint_text_edits(current, edits);
        if (formatted === current) return;
        editor_store.set_markdown(note_id, as_markdown_text(formatted));
        editor_store.set_dirty(note_id, true);
      });
    });
  });
}
