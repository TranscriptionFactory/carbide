import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { ToolchainService } from "$lib/features/toolchain";

export function create_toolchain_lifecycle_reactor(
  ui_store: UIStore,
  toolchain_service: ToolchainService,
): () => void {
  const stop = $effect.root(() => {
    $effect(() => {
      const { open, active_category } = ui_store.settings_dialog;
      if (open && active_category === "toolchain") {
        void toolchain_service.load();
      }
    });
  });

  return stop;
}
