import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { ToolchainService } from "$lib/features/toolchain";

export function create_toolchain_lifecycle_reactor(
  ui_store: UIStore,
  toolchain_service: ToolchainService,
): () => void {
  const stop = $effect.root(() => {
    $effect(() => {
      if (ui_store.settings_dialog.open) {
        void toolchain_service.load();
      }
    });
  });

  return stop;
}
