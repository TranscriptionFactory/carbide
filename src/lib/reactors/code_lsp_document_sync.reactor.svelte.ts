import type { DocumentStore } from "$lib/features/document";
import type { CodeLspService } from "$lib/features/code_lsp";
import type { VaultId, VaultPath } from "$lib/shared/types/ids";

const CODE_FILE_TYPES = new Set(["code", "text"]);

export function create_code_lsp_document_sync_reactor(
  document_store: DocumentStore,
  code_lsp_service: CodeLspService,
  get_vault: () => { id: VaultId; path: VaultPath } | null,
): () => void {
  return $effect.root(() => {
    const opened_files = new Set<string>();

    $effect(() => {
      const vault = get_vault();
      if (!vault) return;

      const content_states = document_store.content_states;
      const current_code_files = new Set<string>();

      for (const [, state] of content_states) {
        if (
          state.status === "ready" &&
          state.content != null &&
          CODE_FILE_TYPES.has(state.file_type)
        ) {
          current_code_files.add(state.file_path);

          if (!opened_files.has(state.file_path)) {
            opened_files.add(state.file_path);
            void code_lsp_service.open_file(
              vault.id,
              vault.path,
              state.file_path,
              state.content,
            );
          }
        }
      }

      for (const path of opened_files) {
        if (!current_code_files.has(path)) {
          opened_files.delete(path);
          void code_lsp_service.close_file(vault.id, path);
        }
      }

      return () => {
        for (const path of opened_files) {
          void code_lsp_service.close_file(vault.id, path);
        }
        opened_files.clear();
      };
    });
  });
}
