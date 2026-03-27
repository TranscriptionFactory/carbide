import type { VaultStore } from "$lib/features/vault";
import type { CodeLspService } from "$lib/features/code_lsp";

export function create_code_lsp_lifecycle_reactor(
  vault_store: VaultStore,
  code_lsp_service: CodeLspService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const vault = vault_store.vault;
      if (!vault) {
        code_lsp_service.stop();
        return;
      }

      return () => {
        void code_lsp_service.stop_vault(vault.id);
      };
    });
  });
}
