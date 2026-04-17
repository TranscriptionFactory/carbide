import type { DocumentStore } from "$lib/features/document";
import type { CodeLspService } from "$lib/features/code_lsp";
import type { VaultId, VaultPath } from "$lib/shared/types/ids";

const CODE_FILE_TYPES = new Set(["code", "text"]);
const DID_CHANGE_DEBOUNCE_MS = 300;

export function create_code_lsp_document_sync_reactor(
  document_store: DocumentStore,
  code_lsp_service: CodeLspService,
  get_vault: () => { id: VaultId; path: VaultPath } | null,
): () => void {
  return $effect.root(() => {
    const opened_files = new Set<string>();
    const last_sent_content = new Map<string, string>();
    const debounce_timers = new Map<string, ReturnType<typeof setTimeout>>();

    function cancel_debounce(path: string) {
      const timer = debounce_timers.get(path);
      if (timer !== undefined) {
        clearTimeout(timer);
        debounce_timers.delete(path);
      }
    }

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
            last_sent_content.set(state.file_path, state.content);
            void code_lsp_service.open_file(
              vault.id,
              vault.path,
              state.file_path,
              state.content,
            );
          } else {
            const current_content = state.edited_content ?? state.content;
            const previously_sent = last_sent_content.get(state.file_path);
            if (current_content !== previously_sent) {
              cancel_debounce(state.file_path);
              const path = state.file_path;
              const content = current_content;
              const vault_id = vault.id;
              debounce_timers.set(
                path,
                setTimeout(() => {
                  debounce_timers.delete(path);
                  last_sent_content.set(path, content);
                  void code_lsp_service.did_change(vault_id, path, content);
                }, DID_CHANGE_DEBOUNCE_MS),
              );
            }
          }
        }
      }

      for (const path of opened_files) {
        if (!current_code_files.has(path)) {
          cancel_debounce(path);
          last_sent_content.delete(path);
          opened_files.delete(path);
          void code_lsp_service.close_file(vault.id, path);
        }
      }

      return () => {
        for (const path of opened_files) {
          cancel_debounce(path);
          last_sent_content.delete(path);
          void code_lsp_service.close_file(vault.id, path);
        }
        opened_files.clear();
      };
    });
  });
}
