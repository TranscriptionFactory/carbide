import { listen } from "@tauri-apps/api/event";
import type { VaultStore } from "$lib/features/vault";
import type {
  MarkdownLspService,
  MarkdownLspStore,
} from "$lib/features/markdown_lsp";
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
): boolean {
  return (
    requested_start_key !== pending_start_key &&
    requested_start_key !== last_requested_start_key
  );
}

export function should_rewrite_iwe_provider(
  provider_key: string,
  last_applied_provider_key: string,
  last_effective_start_key: string,
  status: string | undefined,
): boolean {
  if (status !== "running") return false;
  if (provider_key === last_applied_provider_key) return false;
  return last_effective_start_key.endsWith(":iwes");
}

export function create_markdown_lsp_lifecycle_reactor(
  vault_store: VaultStore,
  markdown_lsp_service: MarkdownLspService,
  ui_store: UIStore,
  markdown_lsp_store?: MarkdownLspStore,
  action_registry?: ActionRegistry,
): () => void {
  const cleanup_restart_listener = setup_restart_listener(markdown_lsp_service);

  let last_applied_provider_key = "";
  let last_requested_start_key = "";
  let last_effective_start_key = "";
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

      if (!vault_id || !enabled || !is_vault_mode) {
        last_requested_start_key = "";
        last_effective_start_key = "";
        pending_start_key = "";
        last_applied_provider_key = "";
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
        )
      ) {
        return;
      }
      pending_start_key = requested_start_key;

      // Snapshot to avoid deep proxy tracking of ai_providers in async body
      void markdown_lsp_service
        .start(provider, custom_path || undefined)
        .then((effective_provider) => {
          if (!effective_provider?.effective_provider) return;
          active_vault_id = vault_id;
          last_requested_start_key = requested_start_key;
          last_effective_start_key = `${requested_start_key}:${effective_provider.effective_provider}`;
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
        const status = markdown_lsp_store.status;
        if (status === "running") {
          void action_registry
            .execute("iwe.refresh_transforms")
            .catch((error: unknown) => {
              log.from_error("Failed to refresh IWE transforms", error);
            });
        }
      });
    }

    $effect(() => {
      const settings_loaded = ui_store.editor_settings_loaded;
      if (!settings_loaded) return;

      const lsp_provider = ui_store.editor_settings.markdown_lsp_provider;
      if (lsp_provider !== "iwes") return;

      const settings_snapshot = $state.snapshot(ui_store.editor_settings);
      const resolved = resolve_iwe_ai_provider(settings_snapshot);
      if (!resolved || is_output_file_provider(resolved)) return;

      const status = markdown_lsp_store?.status;
      const key = `${resolved.id}:${resolved.model ?? ""}:${resolved.transport.kind === "cli" ? resolved.transport.command : ""}`;
      if (
        !should_rewrite_iwe_provider(
          key,
          last_applied_provider_key,
          last_effective_start_key,
          status,
        )
      ) {
        return;
      }
      last_applied_provider_key = key;

      void markdown_lsp_service
        .rewrite_provider_and_restart(resolved)
        .catch((error: unknown) => {
          log.from_error("Failed to rewrite IWE config for provider", error);
        });
    });
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
