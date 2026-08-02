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
import { should_autotitle } from "$lib/features/assistant";
import type { RagService } from "$lib/features/rag/application/rag_service";
import type {
  AssistantChatStore,
  AssistantKernelService,
  AssistantSessionService,
  RunHandle,
} from "$lib/features/assistant";
import { AgentRunner } from "$lib/features/rag/application/agent_runner";
import { AgentProposalService } from "$lib/features/rag/application/agent_proposal_service";
import { resolve_agent_note_sync } from "$lib/features/rag/domain/agent_note_sync";
import type { AssistantProposalStore } from "$lib/features/assistant";
import {
  as_markdown_text,
  as_note_path,
  type NotePath,
} from "$lib/shared/types/ids";

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
    chat_store: AssistantChatStore;
    rag_service: RagService;
    session_service: AssistantSessionService;
    assistant_kernel: AssistantKernelService;
    assistant_proposals: AssistantProposalStore;
  },
) {
  const {
    registry,
    stores,
    services,
    chat_store,
    rag_service,
    session_service,
    assistant_kernel,
    assistant_proposals,
  } = input;

  function find_background_tab(note_path: NotePath) {
    const tab = stores.tab.find_tab_by_path(note_path);
    if (!tab || tab.id === stores.tab.active_tab_id) return null;
    return { is_dirty: tab.is_dirty };
  }

  // Mutating tools include delete_note and rename_note, so a "changed" path may
  // no longer exist. Disk is the only reliable witness — the tool name does not
  // say which of its paths survived — so reopen and clean up on not_found the
  // same way the watcher's note_removed branch does.
  async function reload_open_note(note_path: NotePath) {
    stores.tab.invalidate_cache_by_path(note_path);
    services.editor.close_buffer(note_path);
    const result = await services.note.open_note(note_path, false, {
      force_reload: true,
      cleanup_if_missing: true,
    });
    if (result.status === "not_found") {
      services.note.clear_open_note();
      services.tab.remove_tab(note_path);
    }
  }

  async function sync_changed_notes(paths: string[]) {
    for (const path of paths) {
      const note_path = as_note_path(path);
      const open_note = stores.editor.open_note;
      const decision = resolve_agent_note_sync(
        path,
        open_note && {
          path: open_note.meta.path,
          is_dirty: open_note.is_dirty,
        },
        find_background_tab(note_path),
      );

      switch (decision) {
        case "reload":
          await reload_open_note(note_path);
          break;
        case "mark_conflict":
          services.tab.mark_conflict(note_path);
          break;
        case "invalidate_tab_cache":
          services.tab.invalidate_cache(note_path);
          break;
        case "ignore":
          break;
      }
    }
  }

  const agent_proposals = new AgentProposalService(
    services.git,
    {
      write_note: async (note_path, content) => {
        await services.note.write_note_content(
          as_note_path(note_path),
          as_markdown_text(content),
        );
      },
    },
    assistant_proposals,
    () => Date.now(),
  );

  const agent_runner = new AgentRunner(
    assistant_kernel,
    chat_store,
    stores.vault,
    services.git,
    () => registry.execute(ACTION_IDS.folder_refresh_tree),
    sync_changed_notes,
    agent_proposals,
  );

  function get_providers(): AiProviderConfig[] {
    return stores.ui.editor_settings.ai_providers;
  }

  function persist_session(id: string | null) {
    const vault_id = stores.vault.active_vault_id;
    const session = chat_store.sessions.find((s) => s.id === id);
    if (!vault_id || !session) return;
    void session_service.save_session(vault_id, session);
  }

  // I3: one provider rule. The previous local copy resolved `auto` as
  // providers[0] with no availability probe, so it happily picked a provider
  // whose CLI was not installed.
  async function resolve_provider(): Promise<AiProviderConfig | null> {
    const settings = stores.ui.editor_settings;
    return await assistant_kernel.resolve_provider(
      chat_store.provider_id || settings.ai_default_provider_id,
    );
  }

  registry.register({
    id: ACTION_IDS.rag_open,
    label: "Chat with Vault",
    execute: async () => {
      if (!chat_store.provider_id) {
        const provider = await resolve_provider();
        if (provider) chat_store.set_provider(provider.id);
      }
      if (!chat_store.active) {
        chat_store.set_permission_mode(
          stores.ui.editor_settings.ai_agent_permission_default,
        );
      }
      stores.ui.set_sidebar_view("rag");
    },
  });

  let ask_handle: RunHandle | null = null;

  registry.register({
    id: ACTION_IDS.rag_stop,
    label: "Stop Vault Chat Reply",
    execute: () => {
      ask_handle?.stop();
    },
  });

  async function maybe_autotitle(provider: AiProviderConfig, revision: number) {
    const session = chat_store.active;
    if (!session || !should_autotitle(session)) return;
    if (session.messages.filter((m) => m.role === "assistant").length !== 1) {
      return;
    }
    const session_id = session.id;
    const title = await session_service.generate_title(
      provider,
      session.messages,
    );
    if (title === null) return;
    if (revision !== chat_store.revision) return;
    const live = chat_store.sessions.find((s) => s.id === session_id);
    if (!live || !should_autotitle(live)) return;
    chat_store.rename_session(session_id, title, "generated");
    persist_session(session_id);
  }

  async function resolve_ask_provider(): Promise<AiProviderConfig | null> {
    if (!stores.ui.editor_settings.ai_enabled) {
      toast.info("AI Assistant is disabled in settings");
      return null;
    }
    const provider = await resolve_provider();
    if (!provider) {
      toast.error("No AI provider configured");
      return null;
    }
    return provider;
  }

  async function run_ask(question: string, reuse_last_user = false) {
    if (stores.op.is_pending(RAG_OP_KEY)) return;
    const provider = await resolve_ask_provider();
    if (!provider) return;

    const revision = chat_store.begin_turn();
    const messages = [...chat_store.messages];
    const history = reuse_last_user ? messages.slice(0, -1) : messages;
    if (!reuse_last_user) chat_store.add_user_message(question);
    chat_store.start_loading();
    stores.op.start(RAG_OP_KEY, Date.now());

    const open_note = stores.editor.open_note;
    let image_parts: AiImagePart[] = [];
    if (
      open_note &&
      should_attach_open_note_images({
        question,
        scope: chat_store.scope,
        note_path: String(open_note.meta.path),
        note_title: String(open_note.meta.title),
      })
    ) {
      image_parts = await collect_open_note_image_parts(input);
    }

    let context_stats: RagContextStats | null = null;
    try {
      let errored = false;
      const settings = stores.ui.editor_settings;
      for await (const event of rag_service.query({
        question,
        provider_config: provider,
        history,
        scope: chat_store.scope,
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
        on_run_started: (handle) => {
          ask_handle = handle;
        },
      })) {
        if (revision !== chat_store.revision) return;
        if (event.type === "generating") {
          chat_store.set_loading_stage("generating");
        } else if (event.type === "sources") {
          context_stats = event.stats;
          chat_store.set_pending_sources(event.sources);
        } else if (event.type === "text" || event.type === "reasoning") {
          if (!chat_store.streaming_id) {
            chat_store.start_streaming();
            if (context_stats) {
              chat_store.set_streaming_context_stats(context_stats);
            }
          }
          if (event.type === "text") {
            chat_store.append_streaming_text(event.text);
          } else {
            chat_store.append_streaming_reasoning(event.text);
          }
        } else if (event.type === "citation") {
          chat_store.add_streaming_citation(event.citation);
        } else if (event.type === "error") {
          chat_store.fail_streaming(event.error);
          stores.op.fail(RAG_OP_KEY, event.error);
          errored = true;
        }
      }
      if (revision !== chat_store.revision) return;
      if (!errored) {
        chat_store.finish_streaming();
        stores.op.succeed(RAG_OP_KEY);
        announce("Vault chat reply ready");
        void maybe_autotitle(provider, revision);
      }
      // persist failed turns too, so the exchange survives a reload
      persist_session(chat_store.active_id);
    } catch (err) {
      if (revision !== chat_store.revision) return;
      const message = error_message(err);
      chat_store.fail_streaming(message);
      stores.op.fail(RAG_OP_KEY, message);
      persist_session(chat_store.active_id);
    } finally {
      ask_handle = null;
    }
  }

  async function run_agent(prompt: string) {
    if (stores.op.is_pending(RAG_OP_KEY)) return;
    const provider = await resolve_ask_provider();
    if (!provider) return;
    const capability = agent_capability(provider);
    if (!capability) {
      toast.error(`${provider.name} does not support agent mode`);
      return;
    }

    const revision = chat_store.begin_turn();
    chat_store.add_user_message(prompt);
    chat_store.start_loading();
    chat_store.set_loading_stage("generating");
    stores.op.start(RAG_OP_KEY, Date.now());

    try {
      const result = await agent_runner.run_turn(
        provider,
        prompt,
        capability.backend,
      );
      if (revision !== chat_store.revision) return;
      if (result.status === "done") {
        stores.op.succeed(RAG_OP_KEY);
        announce("Vault chat reply ready");
        void maybe_autotitle(provider, revision);
      } else {
        stores.op.fail(RAG_OP_KEY, result.message);
      }
      persist_session(chat_store.active_id);
    } catch (err) {
      if (revision !== chat_store.revision) return;
      const message = error_message(err);
      chat_store.fail_streaming(message);
      stores.op.fail(RAG_OP_KEY, message);
      persist_session(chat_store.active_id);
    }
  }

  registry.register({
    id: ACTION_IDS.rag_ask,
    label: "Ask Vault Chat",
    execute: async (payload: unknown) => {
      const question = payload_field(payload, "question").trim();
      if (!question) return;
      if (chat_store.mode === "agent") {
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
      chat_store.set_mode(mode);
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
      chat_store.set_permission_mode(mode);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_copy_message,
    label: "Copy Vault Chat Message",
    execute: async (...args: unknown[]) => {
      const id = typeof args[0] === "string" ? args[0] : "";
      const message = chat_store.messages.find((m) => m.id === id);
      if (!message) return;
      try {
        await services.clipboard.copy_text(message.content);
      } catch {
        toast.error("Failed to copy message");
      }
    },
  });

  registry.register({
    id: ACTION_IDS.rag_regenerate,
    label: "Regenerate Vault Chat Reply",
    execute: async (...args: unknown[]) => {
      const id = typeof args[0] === "string" ? args[0] : "";
      if (!id || stores.op.is_pending(RAG_OP_KEY)) return;
      const messages = chat_store.messages;
      const idx = messages.findIndex((m) => m.id === id);
      if (idx === -1) return;
      let user_idx = idx;
      while (user_idx >= 0 && messages[user_idx]?.role !== "user") {
        user_idx -= 1;
      }
      const question = messages[user_idx]?.content.trim();
      if (!question) return;
      if (!(await resolve_ask_provider())) return;
      chat_store.truncate_after(id);
      await run_ask(question, true);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_fork,
    label: "Fork Vault Chat",
    execute: (...args: unknown[]) => {
      const id = typeof args[0] === "string" ? args[0] : "";
      if (!id) return;
      const new_id = chat_store.fork_session(id);
      if (!new_id) return;
      stores.op.reset(RAG_OP_KEY);
      persist_session(new_id);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_new_chat,
    label: "New Vault Chat",
    execute: () => {
      chat_store.start_new_session();
      chat_store.set_permission_mode(
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
      chat_store.switch_session(id);
      stores.op.reset(RAG_OP_KEY);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_rename_session,
    label: "Rename Vault Chat Session",
    execute: (...args: unknown[]) => {
      const [id, title] = args as [unknown, unknown];
      if (typeof id !== "string" || typeof title !== "string") return;
      chat_store.rename_session(id, title);
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
      chat_store.delete_session(id);
      stores.op.reset(RAG_OP_KEY);
      if (vault_id) void session_service.delete_session(vault_id, id);
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
