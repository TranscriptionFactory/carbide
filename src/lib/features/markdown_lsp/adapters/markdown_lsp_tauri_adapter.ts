import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { listen } from "@tauri-apps/api/event";
import type { MarkdownLspPort } from "$lib/features/markdown_lsp/ports";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type {
  IweConfigStatus,
  MarkdownLspCodeAction,
  MarkdownLspCompletionItem,
  MarkdownLspDiagnosticsEvent,
  MarkdownLspDocumentSymbol,
  MarkdownLspEvent,
  MarkdownLspHoverResult,
  MarkdownLspInlayHint,
  MarkdownLspLocation,
  MarkdownLspPrepareRenameResult,
  MarkdownLspStartResult,
  MarkdownLspStatusEvent,
  MarkdownLspSymbol,
  MarkdownLspTextEdit,
  MarkdownLspWorkspaceEditResult,
} from "$lib/features/markdown_lsp/types";

export function create_markdown_lsp_tauri_adapter(): MarkdownLspPort {
  return {
    start: (
      vault_id,
      provider,
      custom_binary_path,
      startup_reason,
      initial_iwe_provider_config,
    ) =>
      tauri_invoke<MarkdownLspStartResult>("markdown_lsp_start", {
        vaultId: vault_id,
        provider: provider ?? null,
        customBinaryPath: custom_binary_path ?? null,
        startupReason: startup_reason ?? null,
        initialIweProviderConfig: initial_iwe_provider_config ?? null,
      }),

    stop: (vault_id) =>
      tauri_invoke("markdown_lsp_stop", { vaultId: vault_id }),

    did_open: (vault_id, file_path, content) =>
      tauri_invoke("markdown_lsp_did_open", {
        vaultId: vault_id,
        filePath: file_path,
        content,
      }),

    did_change: (vault_id, file_path, version, content) =>
      tauri_invoke("markdown_lsp_did_change", {
        vaultId: vault_id,
        filePath: file_path,
        version,
        content,
      }),

    did_save: (vault_id, file_path, content) =>
      tauri_invoke("markdown_lsp_did_save", {
        vaultId: vault_id,
        filePath: file_path,
        content,
      }),

    hover: (vault_id, file_path, line, character) =>
      tauri_invoke<MarkdownLspHoverResult>("markdown_lsp_hover", {
        vaultId: vault_id,
        filePath: file_path,
        line,
        character,
      }),

    references: (vault_id, file_path, line, character) =>
      tauri_invoke<MarkdownLspLocation[]>("markdown_lsp_references", {
        vaultId: vault_id,
        filePath: file_path,
        line,
        character,
      }),

    definition: (vault_id, file_path, line, character) =>
      tauri_invoke<MarkdownLspLocation[]>("markdown_lsp_definition", {
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
      tauri_invoke<MarkdownLspCodeAction[]>("markdown_lsp_code_actions", {
        vaultId: vault_id,
        filePath: file_path,
        startLine: start_line,
        startCharacter: start_character,
        endLine: end_line,
        endCharacter: end_character,
      }),

    code_action_resolve: (vault_id, code_action_json) =>
      tauri_invoke<MarkdownLspWorkspaceEditResult>(
        "markdown_lsp_code_action_resolve",
        {
          vaultId: vault_id,
          codeActionJson: code_action_json,
        },
      ),

    workspace_symbols: (vault_id, query) =>
      tauri_invoke<MarkdownLspSymbol[]>("markdown_lsp_workspace_symbols", {
        vaultId: vault_id,
        query,
      }),

    rename: (vault_id, file_path, line, character, new_name) =>
      tauri_invoke<MarkdownLspWorkspaceEditResult>("markdown_lsp_rename", {
        vaultId: vault_id,
        filePath: file_path,
        line,
        character,
        newName: new_name,
      }),

    prepare_rename: (vault_id, file_path, line, character) =>
      tauri_invoke<MarkdownLspPrepareRenameResult | null>(
        "markdown_lsp_prepare_rename",
        {
          vaultId: vault_id,
          filePath: file_path,
          line,
          character,
        },
      ),

    completion: (vault_id, file_path, line, character) =>
      tauri_invoke<MarkdownLspCompletionItem[]>("markdown_lsp_completion", {
        vaultId: vault_id,
        filePath: file_path,
        line,
        character,
      }),

    formatting: (vault_id, file_path) =>
      tauri_invoke<MarkdownLspTextEdit[]>("markdown_lsp_formatting", {
        vaultId: vault_id,
        filePath: file_path,
      }),

    inlay_hints: (vault_id, file_path) =>
      tauri_invoke<MarkdownLspInlayHint[]>("markdown_lsp_inlay_hints", {
        vaultId: vault_id,
        filePath: file_path,
      }),

    document_symbols: (vault_id, file_path) =>
      tauri_invoke<MarkdownLspDocumentSymbol[]>(
        "markdown_lsp_document_symbols",
        {
          vaultId: vault_id,
          filePath: file_path,
        },
      ),

    iwe_config_status: (vault_id) =>
      tauri_invoke<IweConfigStatus>("iwe_config_status", { vaultId: vault_id }),

    iwe_config_reset: (vault_id) =>
      tauri_invoke<void>("iwe_config_reset", { vaultId: vault_id }),

    iwe_config_rewrite_provider: (vault_id, provider_config) =>
      tauri_invoke<void>("iwe_config_rewrite_provider", {
        vaultId: vault_id,
        providerConfig: provider_config,
      }),

    subscribe_diagnostics(
      callback: (event: MarkdownLspDiagnosticsEvent) => void,
    ) {
      let unlisten_fn: (() => void) | null = null;
      let is_disposed = false;

      void listen<MarkdownLspEvent>("markdown_lsp_event", (event) => {
        if (is_disposed) return;
        if (event.payload.type === "diagnostics_updated") {
          callback(event.payload);
        }
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

    subscribe_status(callback: (event: MarkdownLspStatusEvent) => void) {
      let unlisten_fn: (() => void) | null = null;
      let is_disposed = false;

      void listen<MarkdownLspEvent>("markdown_lsp_event", (event) => {
        if (is_disposed) return;
        if (event.payload.type === "status_changed") {
          callback(event.payload);
        }
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
