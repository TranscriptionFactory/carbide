import { toast } from "svelte-sonner";
import type { ActionRegistrationInput } from "$lib/app";
import { ACTION_IDS } from "$lib/app";
import { error_message } from "$lib/shared/utils/error_message";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { RagStore } from "$lib/features/rag/state/rag_store.svelte";
import type { RagService } from "$lib/features/rag/application/rag_service";

const RAG_OP_KEY = "rag.ask";

export function register_rag_actions(
  input: ActionRegistrationInput & {
    rag_store: RagStore;
    rag_service: RagService;
  },
) {
  const { registry, stores, rag_store, rag_service } = input;

  function get_providers(): AiProviderConfig[] {
    return stores.ui.editor_settings.ai_providers;
  }

  function resolve_provider(): AiProviderConfig | null {
    const providers = get_providers();
    const settings = stores.ui.editor_settings;
    const chosen_id = rag_store.provider_id || settings.ai_default_provider_id;
    if (chosen_id === "auto") return providers[0] ?? null;
    return providers.find((p) => p.id === chosen_id) ?? providers[0] ?? null;
  }

  registry.register({
    id: ACTION_IDS.rag_open,
    label: "Chat with Vault",
    execute: () => {
      if (!rag_store.provider_id) {
        const provider = resolve_provider();
        if (provider) rag_store.set_provider(provider.id);
      }
      stores.ui.set_sidebar_view("rag");
    },
  });

  registry.register({
    id: ACTION_IDS.rag_ask,
    label: "Ask Vault Chat",
    execute: async (payload: unknown) => {
      if (!stores.ui.editor_settings.ai_enabled) {
        toast.info("AI Assistant is disabled in settings");
        return;
      }
      if (stores.op.is_pending(RAG_OP_KEY)) return;

      const question =
        typeof payload === "string"
          ? payload.trim()
          : String((payload as { question?: string })?.question ?? "").trim();
      if (!question) return;

      const provider = resolve_provider();
      if (!provider) {
        toast.error("No AI provider configured");
        return;
      }

      const history = [...rag_store.messages];
      rag_store.add_user_message(question);
      rag_store.start_loading();
      stores.op.start(RAG_OP_KEY, Date.now());

      try {
        let errored = false;
        for await (const event of rag_service.query({
          question,
          provider_config: provider,
          history,
          scope: rag_store.scope,
        })) {
          if (event.type === "text") {
            if (!rag_store.streaming_id) rag_store.start_streaming();
            rag_store.append_streaming_text(event.text);
          } else if (event.type === "citation") {
            rag_store.add_streaming_citation(event.citation);
          } else if (event.type === "error") {
            rag_store.fail_streaming(event.error);
            stores.op.fail(RAG_OP_KEY, event.error);
            errored = true;
          }
        }
        if (!errored) {
          rag_store.finish_streaming();
          stores.op.succeed(RAG_OP_KEY);
        }
      } catch (err) {
        const message = error_message(err);
        rag_store.fail_streaming(message);
        stores.op.fail(RAG_OP_KEY, message);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.rag_open_citation,
    label: "Open Cited Note",
    execute: async (payload: unknown) => {
      const note_path =
        typeof payload === "string"
          ? payload
          : String((payload as { note_path?: string })?.note_path ?? "");
      if (!note_path) return;
      await registry.execute(ACTION_IDS.note_open, note_path);
    },
  });
}
