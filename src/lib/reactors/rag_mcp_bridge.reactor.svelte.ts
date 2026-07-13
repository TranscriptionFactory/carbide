import { listen } from "@tauri-apps/api/event";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import type { UIStore } from "$lib/app";
import {
  handle_rag_mcp_query,
  type RagMcpQueryEvent,
  type RagService,
} from "$lib/features/rag";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

export function create_rag_mcp_bridge_reactor(
  rag_service: RagService,
  ui_store: UIStore,
): () => void {
  if (!is_tauri) {
    return () => {};
  }

  function resolve_provider(): AiProviderConfig | null {
    const settings = ui_store.editor_settings;
    const providers = settings.ai_providers;
    const chosen_id = settings.ai_default_provider_id;
    if (chosen_id === "auto") return providers[0] ?? null;
    return providers.find((p) => p.id === chosen_id) ?? providers[0] ?? null;
  }

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void listen<RagMcpQueryEvent>("rag://mcp-query", (event) => {
    if (cancelled) return;
    void handle_rag_mcp_query(rag_service, resolve_provider(), event.payload);
  }).then((fn) => {
    if (cancelled) {
      void Promise.resolve(fn()).catch(() => {});
    } else {
      unlisten = fn;
    }
  });

  return () => {
    cancelled = true;
    if (unlisten) {
      const fn = unlisten;
      unlisten = null;
      void Promise.resolve(fn()).catch(() => {});
    }
  };
}
