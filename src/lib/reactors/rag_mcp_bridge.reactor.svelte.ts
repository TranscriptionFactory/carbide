import { listen } from "@tauri-apps/api/event";
import { is_tauri } from "$lib/shared/utils/detect_platform";
import { create_logger } from "$lib/shared/utils/logger";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type { UIStore } from "$lib/app";
import {
  collect_rag_query_response,
  type RagQueryResponse,
  type RagService,
} from "$lib/features/rag";
import type { RagScope } from "$lib/features/rag/domain/rag_types";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

const log = create_logger("rag_mcp_bridge_reactor");

type RagMcpQueryEvent = {
  id: number;
  question: string;
  folder: string | null;
  tag: string | null;
};

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

  async function handle(event: RagMcpQueryEvent): Promise<void> {
    let response: RagQueryResponse;
    const provider = resolve_provider();
    if (!provider) {
      response = {
        answer: "",
        citations: [],
        error: "No AI provider configured",
      };
    } else {
      const scope: RagScope = {};
      if (event.folder) scope.folders = [event.folder];
      if (event.tag) scope.tags = [event.tag];
      try {
        response = await collect_rag_query_response(
          rag_service.query({
            question: event.question,
            provider_config: provider,
            scope,
          }),
        );
      } catch (error) {
        response = { answer: "", citations: [], error: String(error) };
      }
    }

    await tauri_invoke("rag_query_respond", {
      id: event.id,
      response,
    }).catch((error: unknown) => {
      log.error("Failed to return MCP RAG response", { error });
    });
  }

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void listen<RagMcpQueryEvent>("rag://mcp-query", (event) => {
    if (cancelled) return;
    void handle(event.payload);
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
