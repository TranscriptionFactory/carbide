import { listen } from "@tauri-apps/api/event";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import type { UIStore } from "$lib/app";
import {
  handle_chat_mcp_query,
  type AssistantChatService,
  type AssistantKernelService,
  type ChatMcpQueryEvent,
} from "$lib/features/assistant";

export function create_assistant_chat_mcp_bridge_reactor(
  chat_service: AssistantChatService,
  ui_store: UIStore,
  assistant_kernel: AssistantKernelService,
): () => void {
  if (!is_tauri) {
    return () => {};
  }

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void listen<ChatMcpQueryEvent>("rag://mcp-query", (event) => {
    if (cancelled) return;
    void handle_chat_mcp_query(
      chat_service,
      () =>
        assistant_kernel.resolve_provider(
          ui_store.editor_settings.ai_default_provider_id,
        ),
      ui_store.editor_settings,
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
