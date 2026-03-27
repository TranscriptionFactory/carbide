import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { listen } from "@tauri-apps/api/event";
import type { MarksmanPort } from "$lib/features/marksman/ports";
import type {
  MarksmanCodeAction,
  MarksmanCompletionItem,
  MarksmanDiagnosticsEvent,
  MarksmanDocumentSymbol,
  MarksmanHoverResult,
  MarksmanInlayHint,
  MarksmanLocation,
  MarksmanPrepareRenameResult,
  MarksmanStartResult,
  MarksmanSymbol,
  MarksmanTextEdit,
  MarksmanWorkspaceEditResult,
} from "$lib/features/marksman/types";

export function create_marksman_tauri_adapter(): MarksmanPort {
  return {
    start: (vault_id, provider, custom_binary_path) =>
      tauri_invoke<MarksmanStartResult>("marksman_start", {
        vaultId: vault_id,
        provider: provider ?? null,
        customBinaryPath: custom_binary_path ?? null,
      }),

    stop: (vault_id) => tauri_invoke("marksman_stop", { vaultId: vault_id }),

    did_open: (vault_id, file_path, content) =>
      tauri_invoke("marksman_did_open", {
        vaultId: vault_id,
        filePath: file_path,
        content,
      }),

    did_change: (vault_id, file_path, version, content) =>
      tauri_invoke("marksman_did_change", {
        vaultId: vault_id,
        filePath: file_path,
        version,
        content,
      }),

    did_save: (vault_id, file_path, content) =>
      tauri_invoke("marksman_did_save", {
        vaultId: vault_id,
        filePath: file_path,
        content,
      }),

    hover: (vault_id, file_path, line, character) =>
      tauri_invoke<MarksmanHoverResult>("marksman_hover", {
        vaultId: vault_id,
        filePath: file_path,
        line,
        character,
      }),

    references: (vault_id, file_path, line, character) =>
      tauri_invoke<MarksmanLocation[]>("marksman_references", {
        vaultId: vault_id,
        filePath: file_path,
        line,
        character,
      }),

    definition: (vault_id, file_path, line, character) =>
      tauri_invoke<MarksmanLocation[]>("marksman_definition", {
        vaultId: vault_id,
        filePath: file_path,
        line,
        character,
      }),

    code_actions: (
      vault_id,
      file_path,
      start_line,
      start_character,
      end_line,
      end_character,
    ) =>
      tauri_invoke<MarksmanCodeAction[]>("marksman_code_actions", {
        vaultId: vault_id,
        filePath: file_path,
        startLine: start_line,
        startCharacter: start_character,
        endLine: end_line,
        endCharacter: end_character,
      }),

    code_action_resolve: (vault_id, code_action_json) =>
      tauri_invoke<MarksmanWorkspaceEditResult>(
        "marksman_code_action_resolve",
        {
          vaultId: vault_id,
          codeActionJson: code_action_json,
        },
      ),

    workspace_symbols: (vault_id, query) =>
      tauri_invoke<MarksmanSymbol[]>("marksman_workspace_symbols", {
        vaultId: vault_id,
        query,
      }),

    rename: (vault_id, file_path, line, character, new_name) =>
      tauri_invoke<MarksmanWorkspaceEditResult>("marksman_rename", {
        vaultId: vault_id,
        filePath: file_path,
        line,
        character,
        newName: new_name,
      }),

    prepare_rename: (vault_id, file_path, line, character) =>
      tauri_invoke<MarksmanPrepareRenameResult | null>(
        "marksman_prepare_rename",
        {
          vaultId: vault_id,
          filePath: file_path,
          line,
          character,
        },
      ),

    completion: (vault_id, file_path, line, character) =>
      tauri_invoke<MarksmanCompletionItem[]>("marksman_completion", {
        vaultId: vault_id,
        filePath: file_path,
        line,
        character,
      }),

    formatting: (vault_id, file_path) =>
      tauri_invoke<MarksmanTextEdit[]>("marksman_formatting", {
        vaultId: vault_id,
        filePath: file_path,
      }),

    inlay_hints: (vault_id, file_path) =>
      tauri_invoke<MarksmanInlayHint[]>("marksman_inlay_hints", {
        vaultId: vault_id,
        filePath: file_path,
      }),

    document_symbols: (vault_id, file_path) =>
      tauri_invoke<MarksmanDocumentSymbol[]>("marksman_document_symbols", {
        vaultId: vault_id,
        filePath: file_path,
      }),

    subscribe_diagnostics(callback: (event: MarksmanDiagnosticsEvent) => void) {
      let unlisten_fn: (() => void) | null = null;
      let is_disposed = false;

      void listen<MarksmanDiagnosticsEvent>("marksman_event", (event) => {
        if (is_disposed) return;
        callback(event.payload);
      }).then((fn_ref) => {
        if (is_disposed) {
          try {
            fn_ref();
          } catch {
            /* already disposed */
          }
          return;
        }
        unlisten_fn = fn_ref;
      });

      return () => {
        is_disposed = true;
        if (unlisten_fn) {
          const fn_ref = unlisten_fn;
          unlisten_fn = null;
          try {
            fn_ref();
          } catch {
            /* ignore */
          }
        }
      };
    },
  };
}
