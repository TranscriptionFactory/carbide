import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";
import type { LintStore } from "$lib/features/lint";
import type { LintService } from "$lib/features/lint";
import type { UIStore } from "$lib/app";

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

      void lint_service.start(vault.id, vault.path);

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
  });
}
