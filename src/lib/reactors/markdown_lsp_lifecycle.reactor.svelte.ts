import { listen } from "@tauri-apps/api/event";
import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";
import type {
  MarkdownLspService,
  MarkdownLspStore,
  MarkdownLspStartReason,
} from "$lib/features/markdown_lsp";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { ActionRegistry, UIStore } from "$lib/app";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import { create_logger } from "$lib/shared/utils/logger";
import {
  resolve_iwe_ai_provider,
  is_output_file_provider,
} from "$lib/features/markdown_lsp";

const log = create_logger("markdown_lsp_lifecycle_reactor");

export function should_start_markdown_lsp(
  requested_start_key: string,
  pending_start_key: string,
  last_requested_start_key: string,
  should_defer_start: boolean,
): boolean {
  if (should_defer_start) return false;
  return (
    requested_start_key !== pending_start_key &&
    requested_start_key !== last_requested_start_key
  );
}

export function create_markdown_lsp_lifecycle_reactor(
  vault_store: VaultStore,
  editor_store: EditorStore,
  markdown_lsp_service: MarkdownLspService,
  ui_store: UIStore,
  markdown_lsp_store?: MarkdownLspStore,
  action_registry?: ActionRegistry,
): () => void {
  const cleanup_restart_listener = setup_restart_listener(markdown_lsp_service);

  let last_requested_start_key = "";
  let pending_start_key = "";
  let active_vault_id: string | null = null;

  const cleanup_effect = $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      const is_vault_mode = vault_store.is_vault_mode;
      const settings_loaded = ui_store.editor_settings_loaded;
      if (!settings_loaded) return;

      const enabled = ui_store.editor_settings.markdown_lsp_enabled;
      const provider = ui_store.editor_settings.markdown_lsp_provider;
      const custom_path = ui_store.editor_settings.markdown_lsp_binary_path;
      const open_note_path = editor_store.open_note?.meta.path ?? "";
      const should_defer_iwe_start = provider === "iwes" && !open_note_path;

      if (!vault_id || !enabled || !is_vault_mode) {
        last_requested_start_key = "";
        pending_start_key = "";
        const vault_id_to_stop = active_vault_id;
        active_vault_id = null;
        if (vault_id_to_stop) {
          void markdown_lsp_service.stop_for_vault(vault_id_to_stop);
        }
        return;
      }

      const requested_start_key = `${vault_id}:${provider}:${custom_path ?? ""}`;
      if (
        !should_start_markdown_lsp(
          requested_start_key,
          pending_start_key,
          last_requested_start_key,
          should_defer_iwe_start,
        )
      ) {
        return;
      }
      pending_start_key = requested_start_key;

      const settings_snapshot = $state.snapshot(ui_store.editor_settings);
      const initial_iwe_provider_config =
        provider !== "iwes"
          ? undefined
          : (() => {
              const resolved = resolve_iwe_ai_provider(settings_snapshot);
              if (!resolved || is_output_file_provider(resolved)) {
                return undefined;
              }
              return resolved;
            })();

      const startup_reason =
        provider === "iwes" ? "lazy_open_note" : "initial_start";
      const start_options: {
        reason: MarkdownLspStartReason;
        initial_iwe_provider_config?: AiProviderConfig;
      } = { reason: startup_reason };
      if (initial_iwe_provider_config) {
        start_options.initial_iwe_provider_config = initial_iwe_provider_config;
      }

      void markdown_lsp_service
        .start(provider, custom_path || undefined, start_options)
        .then((result) => {
          if (!result?.effective_provider) return;
          active_vault_id = vault_id;
          last_requested_start_key = requested_start_key;
        })
        .catch((error: unknown) => {
          log.from_error("Failed to start markdown LSP for vault", error);
        })
        .finally(() => {
          if (pending_start_key === requested_start_key) {
            pending_start_key = "";
          }
        });
    });

    if (markdown_lsp_store && action_registry) {
      $effect(() => {
        const settings_loaded = ui_store.editor_settings_loaded;
        if (!settings_loaded) return;

        const enabled = ui_store.editor_settings.markdown_lsp_enabled;
        const provider = ui_store.editor_settings.markdown_lsp_provider;
        const vault_id = vault_store.active_vault_id;
        if (!vault_id || !enabled || provider !== "iwes") return;

        void action_registry
          .execute("iwe.refresh_transforms")
          .catch((error: unknown) => {
            log.from_error("Failed to refresh IWE transforms", error);
          });
      });
    }
  });

  return () => {
    cleanup_effect();
    cleanup_restart_listener();
    const vault_id_to_stop = active_vault_id;
    active_vault_id = null;
    if (vault_id_to_stop) {
      void markdown_lsp_service.stop_for_vault(vault_id_to_stop);
    }
  };
}

function setup_restart_listener(
  markdown_lsp_service: MarkdownLspService,
): () => void {
  if (!is_tauri) return () => {};

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void listen("markdown-lsp-restart-requested", () => {
    if (cancelled) return;
    log.info("Markdown LSP restart requested via CLI");
    void markdown_lsp_service.restart().catch((error: unknown) => {
      log.from_error("Failed to restart markdown LSP via CLI", error);
    });
  }).then((fn) => {
    if (cancelled) {
      try {
        fn();
      } catch {
        /* already disposed */
      }
    } else {
      unlisten = fn;
    }
  });

  return () => {
    cancelled = true;
    if (unlisten) {
      const fn = unlisten;
      unlisten = null;
      try {
        fn();
      } catch {
        /* already disposed */
      }
    }
  };
}
