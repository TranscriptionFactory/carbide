import { toast } from "svelte-sonner";
import type { ActionRegistrationInput } from "$lib/app";
import { ACTION_IDS } from "$lib/app";
import { error_message } from "$lib/shared/utils/error_message";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { RagStore } from "$lib/features/rag/state/rag_store.svelte";
import type { RagService } from "$lib/features/rag/application/rag_service";

const RAG_OP_KEY = "rag.ask";

function payload_field(payload: unknown, field: string): string {
  if (typeof payload === "string") return payload;
  return String((payload as Record<string, unknown>)?.[field] ?? "");
}

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

  function persist_session(id: string | null) {
    const vault_id = stores.vault.active_vault_id;
    const session = rag_store.sessions.find((s) => s.id === id);
    if (!vault_id || !session) return;
    void rag_service.save_session(vault_id, session);
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

      const question = payload_field(payload, "question").trim();
      if (!question) return;

      const provider = resolve_provider();
      if (!provider) {
        toast.error("No AI provider configured");
        return;
      }

      const revision = rag_store.begin_turn();
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
          if (revision !== rag_store.revision) return;
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
        if (revision !== rag_store.revision) return;
        if (!errored) {
          rag_store.finish_streaming();
          stores.op.succeed(RAG_OP_KEY);
          persist_session(rag_store.active_id);
        }
      } catch (err) {
        if (revision !== rag_store.revision) return;
        const message = error_message(err);
        rag_store.fail_streaming(message);
        stores.op.fail(RAG_OP_KEY, message);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.rag_new_chat,
    label: "New Vault Chat",
    execute: () => {
      rag_store.start_new_session();
      stores.op.reset(RAG_OP_KEY);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_switch_session,
    label: "Switch Vault Chat Session",
    execute: (...args: unknown[]) => {
      const id = typeof args[0] === "string" ? args[0] : "";
      if (!id) return;
      rag_store.switch_session(id);
      stores.op.reset(RAG_OP_KEY);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_rename_session,
    label: "Rename Vault Chat Session",
    execute: (...args: unknown[]) => {
      const [id, title] = args as [unknown, unknown];
      if (typeof id !== "string" || typeof title !== "string") return;
      rag_store.rename_session(id, title);
      persist_session(id);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_delete_session,
    label: "Delete Vault Chat Session",
    execute: (...args: unknown[]) => {
      const id = typeof args[0] === "string" ? args[0] : "";
      if (!id) return;
      const vault_id = stores.vault.active_vault_id;
      rag_store.delete_session(id);
      stores.op.reset(RAG_OP_KEY);
      if (vault_id) void rag_service.delete_session(vault_id, id);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_open_citation,
    label: "Open Cited Note",
    execute: async (payload: unknown) => {
      const note_path = payload_field(payload, "note_path");
      if (!note_path) return;
      await registry.execute(ACTION_IDS.note_open, note_path);
    },
  });
}
