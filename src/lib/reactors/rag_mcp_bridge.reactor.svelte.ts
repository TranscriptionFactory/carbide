import { listen } from "@tauri-apps/api/event";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import type { UIStore } from "$lib/app";
import {
  handle_rag_mcp_query,
  type RagMcpQueryEvent,
  type RagService,
} from "$lib/features/rag";
import type { AssistantKernelService } from "$lib/features/assistant";

export function create_rag_mcp_bridge_reactor(
  rag_service: RagService,
  ui_store: UIStore,
  assistant_kernel: AssistantKernelService,
): () => void {
  if (!is_tauri) {
    return () => {};
  }

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void listen<RagMcpQueryEvent>("rag://mcp-query", (event) => {
    if (cancelled) return;
    void handle_rag_mcp_query(
      rag_service,
      () =>
        assistant_kernel.resolve_provider(
          ui_store.editor_settings.ai_default_provider_id,
        ),
      event.payload,
    );
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
