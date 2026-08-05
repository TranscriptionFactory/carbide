import type { VaultStore } from "$lib/features/vault";
import type { LintService } from "$lib/features/lint";
import type { UIStore } from "$lib/app";

// Formatting on save happens inside NoteService (format_for_save hook wired
// at the composition root) before the write, so this reactor only manages
// the lint service lifecycle. The old dirty→clean format-then-resave effect
// is gone — it doubled every save.
export function create_lint_reactor(
  vault_store: VaultStore,
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
  });
}
