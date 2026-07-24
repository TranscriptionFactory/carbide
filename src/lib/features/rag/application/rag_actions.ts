import { toast } from "$lib/shared/ui/toast";
import type { ActionRegistrationInput } from "$lib/app";
import { ACTION_IDS } from "$lib/app";
import { error_message } from "$lib/shared/utils/error_message";
import { announce } from "$lib/shared/a11y/live_announcer.svelte";
import { collect_open_note_image_parts } from "$lib/features/ai";
import { agent_capability } from "$lib/features/ai";
import type { AiImagePart } from "$lib/features/ai";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import type { RagContextStats } from "$lib/features/rag/domain/rag_types";
import { should_attach_open_note_images } from "$lib/features/rag/domain/rag_open_note_images";
import { should_autotitle } from "$lib/features/rag/domain/rag_session";
import type { RagStore } from "$lib/features/rag/state/rag_store.svelte";
import type { RagService } from "$lib/features/rag/application/rag_service";
import type { AgentPort } from "$lib/features/rag/ports";
import { AgentRunner } from "$lib/features/rag/application/agent_runner";

const RAG_OP_KEY = "rag.ask";

const RETRIEVE_LIMIT_MIN = 1;
const RETRIEVE_LIMIT_MAX = 50;
const TOKEN_BUDGET_MIN = 1000;
const TOKEN_BUDGET_MAX = 128000;

function clamp_setting(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function payload_field(payload: unknown, field: string): string {
  if (typeof payload === "string") return payload;
  return String((payload as Record<string, unknown>)?.[field] ?? "");
}

export function register_rag_actions(
  input: ActionRegistrationInput & {
    rag_store: RagStore;
    rag_service: RagService;
    agent_port: AgentPort;
  },
) {
  const { registry, stores, services, rag_store, rag_service, agent_port } =
    input;

  const agent_runner = new AgentRunner(
    agent_port,
    rag_store,
    stores.vault,
    services.git,
    () => registry.execute(ACTION_IDS.folder_refresh_tree),
  );

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
      if (!rag_store.active) {
        rag_store.set_permission_mode(
          stores.ui.editor_settings.ai_agent_permission_default,
        );
      }
      stores.ui.set_sidebar_view("rag");
    },
  });

  let ask_abort: AbortController | null = null;

  registry.register({
    id: ACTION_IDS.rag_stop,
    label: "Stop Vault Chat Reply",
    execute: () => {
      ask_abort?.abort();
    },
  });

  async function maybe_autotitle(provider: AiProviderConfig, revision: number) {
    const session = rag_store.active;
    if (!session || !should_autotitle(session)) return;
    if (session.messages.filter((m) => m.role === "assistant").length !== 1) {
      return;
    }
    const session_id = session.id;
    const title = await rag_service.generate_title(provider, session.messages);
    if (title === null) return;
    if (revision !== rag_store.revision) return;
    const live = rag_store.sessions.find((s) => s.id === session_id);
    if (!live || !should_autotitle(live)) return;
    rag_store.rename_session(session_id, title, "generated");
    persist_session(session_id);
  }

  function resolve_ask_provider(): AiProviderConfig | null {
    if (!stores.ui.editor_settings.ai_enabled) {
      toast.info("AI Assistant is disabled in settings");
      return null;
    }
    const provider = resolve_provider();
    if (!provider) {
      toast.error("No AI provider configured");
      return null;
    }
    return provider;
  }

  async function run_ask(question: string, reuse_last_user = false) {
    if (stores.op.is_pending(RAG_OP_KEY)) return;
    const provider = resolve_ask_provider();
    if (!provider) return;

    const revision = rag_store.begin_turn();
    const messages = [...rag_store.messages];
    const history = reuse_last_user ? messages.slice(0, -1) : messages;
    if (!reuse_last_user) rag_store.add_user_message(question);
    rag_store.start_loading();
    stores.op.start(RAG_OP_KEY, Date.now());

    const open_note = stores.editor.open_note;
    let image_parts: AiImagePart[] = [];
    if (
      open_note &&
      should_attach_open_note_images({
        question,
        scope: rag_store.scope,
        note_path: String(open_note.meta.path),
        note_title: String(open_note.meta.title),
      })
    ) {
      image_parts = await collect_open_note_image_parts(input);
    }

    ask_abort = new AbortController();
    let context_stats: RagContextStats | null = null;
    try {
      let errored = false;
      const settings = stores.ui.editor_settings;
      for await (const event of rag_service.query({
        question,
        provider_config: provider,
        history,
        scope: rag_store.scope,
        retrieve_limit: clamp_setting(
          settings.ai_rag_retrieve_limit,
          RETRIEVE_LIMIT_MIN,
          RETRIEVE_LIMIT_MAX,
          DEFAULT_EDITOR_SETTINGS.ai_rag_retrieve_limit,
        ),
        assembler_options: {
          token_budget: clamp_setting(
            settings.ai_rag_context_token_budget,
            TOKEN_BUDGET_MIN,
            TOKEN_BUDGET_MAX,
            DEFAULT_EDITOR_SETTINGS.ai_rag_context_token_budget,
          ),
        },
        image_parts,
        signal: ask_abort.signal,
      })) {
        if (revision !== rag_store.revision) return;
        if (event.type === "generating") {
          rag_store.set_loading_stage("generating");
        } else if (event.type === "sources") {
          context_stats = event.stats;
          rag_store.set_pending_sources(event.sources);
        } else if (event.type === "text" || event.type === "reasoning") {
          if (!rag_store.streaming_id) {
            rag_store.start_streaming();
            if (context_stats) {
              rag_store.set_streaming_context_stats(context_stats);
            }
          }
          if (event.type === "text") {
            rag_store.append_streaming_text(event.text);
          } else {
            rag_store.append_streaming_reasoning(event.text);
          }
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
        announce("Vault chat reply ready");
        void maybe_autotitle(provider, revision);
      }
      // persist failed turns too, so the exchange survives a reload
      persist_session(rag_store.active_id);
    } catch (err) {
      if (revision !== rag_store.revision) return;
      const message = error_message(err);
      rag_store.fail_streaming(message);
      stores.op.fail(RAG_OP_KEY, message);
      persist_session(rag_store.active_id);
    } finally {
      ask_abort = null;
    }
  }

  async function run_agent(prompt: string) {
    if (stores.op.is_pending(RAG_OP_KEY)) return;
    const provider = resolve_ask_provider();
    if (!provider) return;
    const capability = agent_capability(provider);
    if (!capability) {
      toast.error(`${provider.name} does not support agent mode`);
      return;
    }

    const revision = rag_store.begin_turn();
    rag_store.add_user_message(prompt);
    rag_store.start_loading();
    rag_store.set_loading_stage("generating");
    stores.op.start(RAG_OP_KEY, Date.now());

    try {
      const result = await agent_runner.run_turn(
        provider,
        prompt,
        capability.backend,
      );
      if (revision !== rag_store.revision) return;
      if (result.status === "done") {
        stores.op.succeed(RAG_OP_KEY);
        announce("Vault chat reply ready");
        void maybe_autotitle(provider, revision);
      } else {
        stores.op.fail(RAG_OP_KEY, result.message);
      }
      persist_session(rag_store.active_id);
    } catch (err) {
      if (revision !== rag_store.revision) return;
      const message = error_message(err);
      rag_store.fail_streaming(message);
      stores.op.fail(RAG_OP_KEY, message);
      persist_session(rag_store.active_id);
    }
  }

  registry.register({
    id: ACTION_IDS.rag_ask,
    label: "Ask Vault Chat",
    execute: async (payload: unknown) => {
      const question = payload_field(payload, "question").trim();
      if (!question) return;
      if (rag_store.mode === "agent") {
        await run_agent(question);
      } else {
        await run_ask(question);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.rag_set_mode,
    label: "Set Vault Chat Mode",
    execute: (...args: unknown[]) => {
      const mode = args[0];
      if (mode !== "ask" && mode !== "agent") return;
      if (mode === "agent" && !stores.ui.editor_settings.ai_enabled) {
        toast.info("AI Assistant is disabled in settings");
        return;
      }
      rag_store.set_mode(mode);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_agent_abort,
    label: "Stop Vault Agent Run",
    execute: () => {
      agent_runner.abort();
    },
  });

  registry.register({
    id: ACTION_IDS.rag_set_permission_mode,
    label: "Set Vault Agent Permission Mode",
    execute: (...args: unknown[]) => {
      const mode = args[0];
      if (mode !== "safe" && mode !== "power") return;
      rag_store.set_permission_mode(mode);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_copy_message,
    label: "Copy Vault Chat Message",
    execute: async (...args: unknown[]) => {
      const id = typeof args[0] === "string" ? args[0] : "";
      const message = rag_store.messages.find((m) => m.id === id);
      if (!message) return;
      await navigator.clipboard.writeText(message.content);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_regenerate,
    label: "Regenerate Vault Chat Reply",
    execute: async (...args: unknown[]) => {
      const id = typeof args[0] === "string" ? args[0] : "";
      if (!id || stores.op.is_pending(RAG_OP_KEY)) return;
      const messages = rag_store.messages;
      const idx = messages.findIndex((m) => m.id === id);
      if (idx === -1) return;
      let user_idx = idx;
      while (user_idx >= 0 && messages[user_idx]?.role !== "user") {
        user_idx -= 1;
      }
      const question = messages[user_idx]?.content.trim();
      if (!question) return;
      if (!resolve_ask_provider()) return;
      rag_store.truncate_after(id);
      await run_ask(question, true);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_fork,
    label: "Fork Vault Chat",
    execute: (...args: unknown[]) => {
      const id = typeof args[0] === "string" ? args[0] : "";
      if (!id) return;
      const new_id = rag_store.fork_session(id);
      if (!new_id) return;
      stores.op.reset(RAG_OP_KEY);
      persist_session(new_id);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_new_chat,
    label: "New Vault Chat",
    execute: () => {
      rag_store.start_new_session();
      rag_store.set_permission_mode(
        stores.ui.editor_settings.ai_agent_permission_default,
      );
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
