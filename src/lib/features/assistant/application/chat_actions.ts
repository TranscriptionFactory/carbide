import { toast } from "$lib/shared/ui/toast";
import type { ActionRegistrationInput } from "$lib/app";
import { ACTION_IDS } from "$lib/app";
import { error_message } from "$lib/shared/utils/error_message";
import { announce } from "$lib/shared/a11y/live_announcer.svelte";
import { collect_open_note_image_parts } from "$lib/features/ai";
import { agent_capability } from "$lib/features/ai";
import type { AiImagePart } from "$lib/features/ai";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AssistantContextStats } from "$lib/features/assistant/types/session";
import { should_attach_open_note_images } from "$lib/features/assistant/domain/open_note_images";
import { should_autotitle } from "$lib/features/assistant";
import type { AssistantChatService } from "$lib/features/assistant/application/assistant_chat_service";
import { build_chat_query_input } from "$lib/features/assistant/application/chat_query_input";
import type {
  AssistantChatStore,
  AssistantDocumentPort,
  AssistantKernelService,
  AssistantSessionService,
  RunHandle,
} from "$lib/features/assistant";
import { AgentRunner } from "$lib/features/assistant/application/agent_runner";
import type {
  AssistantPermissionPort,
  PermissionResponse,
} from "$lib/features/assistant/ports";
import { AgentProposalService } from "$lib/features/assistant/application/agent_proposal_service";
import { sync_changed_notes as sync_notes } from "$lib/features/assistant/application/note_sync_actions";
import type { AssistantProposalStore } from "$lib/features/assistant";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

// An edit is a turn of the same conversation, so register_assistant_edit_actions
// shares this in-flight slot.
export const CHAT_OP_KEY = "rag.ask";

// Both open surfaces (sidebar rag.open, panel assistant.open_panel) prime the
// same store the same way: resolve a provider on first open. Consent is not
// primed — it starts off for every session and is only ever granted in the
// conversation it applies to.
export async function prime_chat_store(
  chat_store: AssistantChatStore,
  assistant_kernel: AssistantKernelService,
  settings: { ai_default_provider_id: string },
): Promise<void> {
  if (chat_store.provider_id) return;
  const provider = await assistant_kernel.resolve_provider(
    settings.ai_default_provider_id,
  );
  if (provider) chat_store.set_provider(provider.id);
}

function payload_field(payload: unknown, field: string): string {
  if (typeof payload === "string") return payload;
  return String((payload as Record<string, unknown>)?.[field] ?? "");
}

export function register_chat_actions(
  input: ActionRegistrationInput & {
    chat_store: AssistantChatStore;
    chat_service: AssistantChatService;
    session_service: AssistantSessionService;
    assistant_kernel: AssistantKernelService;
    permissions: AssistantPermissionPort;
    assistant_proposals: AssistantProposalStore;
    documents: AssistantDocumentPort;
  },
) {
  const {
    registry,
    stores,
    services,
    chat_store,
    chat_service,
    session_service,
    assistant_kernel,
    permissions,
    assistant_proposals,
    documents,
  } = input;

  const sync_changed_notes = (paths: string[]) =>
    sync_notes({ stores, services }, paths);

  const agent_proposals = new AgentProposalService(
    services.git,
    {
      write_note: async (note_path, content, expected_mtime) => {
        await services.note.write_note_content(
          as_note_path(note_path),
          as_markdown_text(content),
          expected_mtime,
        );
      },
    },
    assistant_proposals,
    () => Date.now(),
  );

  // Disk, not the editor store: a note that has been through "Keep my changes"
  // carries a stored mtime of 0, which resolves to no guard at all.
  async function read_note_mtime(note_path: string): Promise<number | null> {
    const vault_id = stores.vault.active_vault_id;
    if (!vault_id) return null;
    const doc = await services.note.read_note(
      vault_id,
      as_note_path(note_path),
    );
    return doc.meta.mtime_ms;
  }

  const agent_runner = new AgentRunner(
    assistant_kernel,
    chat_store,
    stores.vault,
    services.git,
    () => registry.execute(ACTION_IDS.folder_refresh_tree),
    sync_changed_notes,
    agent_proposals,
    read_note_mtime,
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
      await prime_chat_store(
        chat_store,
        assistant_kernel,
        stores.ui.editor_settings,
      );
      stores.ui.set_sidebar_view("rag");
    },
  });

  let ask_handle: RunHandle | null = null;

  registry.register({
    id: ACTION_IDS.rag_stop,
    label: "Stop Vault Chat Reply",
    execute: () => {
      chat_store.restore_queued_prompt();
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

  function ensure_ai_enabled(): boolean {
    if (stores.ui.editor_settings.ai_enabled) return true;
    toast.info("AI Assistant is disabled in settings");
    return false;
  }

  async function resolve_ask_provider(): Promise<AiProviderConfig | null> {
    if (!ensure_ai_enabled()) return null;
    const provider = await resolve_provider();
    if (!provider) {
      toast.error("No AI provider configured");
      return null;
    }
    return provider;
  }

  async function run_ask(question: string, reuse_last_user = false) {
    if (stores.op.is_pending(CHAT_OP_KEY)) {
      chat_store.queue_prompt(question);
      return;
    }
    const provider = await resolve_ask_provider();
    if (!provider) {
      // A regenerated question never came from the composer, so it has nothing
      // to go back to.
      if (!reuse_last_user) chat_store.restore_to_composer(question);
      return;
    }

    const revision = chat_store.begin_turn();
    const messages = [...chat_store.messages];
    const history = reuse_last_user ? messages.slice(0, -1) : messages;
    if (!reuse_last_user) chat_store.add_user_message(question);
    chat_store.start_loading();
    stores.op.start(CHAT_OP_KEY, Date.now());

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

    // The attachment resolves fresh from the open buffer at submit time
    // (snapshot chip, live content). A closed tab silently drops out of the
    // turn — the chip renders "(closed)" as the signal.
    const attached = chat_store.attached_document;
    const attachment = attached
      ? (documents.read_document(attached.path) ?? undefined)
      : undefined;

    let context_stats: AssistantContextStats | null = null;
    try {
      let errored = false;
      // The service yields `done` only on a natural finish: a stopped run ends
      // the stream without it, and an errored one yields `error` instead.
      let completed = false;
      for await (const event of chat_service.query(
        build_chat_query_input({
          question,
          provider_config: provider,
          settings: stores.ui.editor_settings,
          history,
          scope: chat_store.scope,
          image_parts,
          ...(attachment ? { attachment } : {}),
          on_run_started: (handle) => {
            ask_handle = handle;
          },
        }),
      )) {
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
          stores.op.fail(CHAT_OP_KEY, event.error);
          errored = true;
        } else if (event.type === "done") {
          completed = true;
        }
      }
      if (revision !== chat_store.revision) return;
      if (!errored) {
        chat_store.finish_streaming();
        stores.op.succeed(CHAT_OP_KEY);
        announce("Vault chat reply ready");
        void maybe_autotitle(provider, revision);
      }
      // D4: a turn that never completed was stopped or failed, and neither is
      // consent to send. The queued prompt goes back to the composer.
      if (!completed) chat_store.restore_queued_prompt();
      // persist failed turns too, so the exchange survives a reload
      persist_session(chat_store.active_id);
    } catch (err) {
      if (revision !== chat_store.revision) return;
      const message = error_message(err);
      chat_store.fail_streaming(message);
      stores.op.fail(CHAT_OP_KEY, message);
      chat_store.restore_queued_prompt();
      persist_session(chat_store.active_id);
    } finally {
      ask_handle = null;
    }
  }

  async function run_agent(prompt: string) {
    if (stores.op.is_pending(CHAT_OP_KEY)) {
      chat_store.queue_prompt(prompt);
      return;
    }
    const provider = await resolve_ask_provider();
    if (!provider) {
      chat_store.restore_to_composer(prompt);
      return;
    }
    const capability = agent_capability(provider);
    if (!capability) {
      toast.error(`${provider.name} does not support agent mode`);
      chat_store.restore_to_composer(prompt);
      return;
    }

    const revision = chat_store.begin_turn();
    chat_store.add_user_message(prompt);
    chat_store.start_loading();
    chat_store.set_loading_stage("generating");
    stores.op.start(CHAT_OP_KEY, Date.now());

    try {
      const result = await agent_runner.run_turn(
        provider,
        prompt,
        capability.backend,
      );
      if (revision !== chat_store.revision) return;
      if (result.status === "done") {
        stores.op.succeed(CHAT_OP_KEY);
        announce("Vault chat reply ready");
        void maybe_autotitle(provider, revision);
      } else {
        stores.op.fail(CHAT_OP_KEY, result.message);
        chat_store.restore_queued_prompt();
      }
      persist_session(chat_store.active_id);
    } catch (err) {
      if (revision !== chat_store.revision) return;
      const message = error_message(err);
      chat_store.fail_streaming(message);
      stores.op.fail(CHAT_OP_KEY, message);
      chat_store.restore_queued_prompt();
      persist_session(chat_store.active_id);
    }
  }

  async function run_chat_turn(question: string) {
    if (chat_store.mode === "agent") {
      await run_agent(question);
    } else {
      await run_ask(question);
    }
  }

  // Drained from the callers rather than from inside the runners: run_ask only
  // releases its run handle in its own `finally`, so a turn started from within
  // it would have the Stop button's handle cleared out from under it.
  async function drain_queued_prompts() {
    while (!stores.op.is_pending(CHAT_OP_KEY)) {
      const queued = chat_store.take_queued_prompt();
      if (queued === null) return;
      await run_chat_turn(queued);
    }
  }

  registry.register({
    id: ACTION_IDS.rag_ask,
    label: "Ask Vault Chat",
    execute: async (payload: unknown) => {
      const question = payload_field(payload, "question").trim();
      if (!question) return;
      await run_chat_turn(question);
      await drain_queued_prompts();
    },
  });

  registry.register({
    id: ACTION_IDS.rag_set_mode,
    label: "Set Vault Chat Mode",
    execute: (...args: unknown[]) => {
      const mode = args[0];
      if (mode !== "ask" && mode !== "agent") return;
      if (mode === "agent" && !ensure_ai_enabled()) return;
      chat_store.set_mode(mode);
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_permission_respond,
    label: "Respond to Agent Permission Request",
    execute: async (...args: unknown[]) => {
      const [request_id, response] = args as [unknown, unknown];
      if (typeof request_id !== "string" || request_id === "") return;
      if (typeof response !== "object" || response === null) return;
      try {
        await permissions.respond(request_id, response as PermissionResponse);
      } catch (e) {
        toast.error(error_message(e));
      }
    },
  });

  registry.register({
    id: ACTION_IDS.rag_agent_abort,
    label: "Stop Vault Agent Run",
    execute: () => {
      // An aborted agent turn still resolves as `done`, so the stop itself is
      // the only signal that the queued prompt must not send.
      chat_store.restore_queued_prompt();
      agent_runner.abort();
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_set_auto_approve,
    label: "Set Agent Auto-approve",
    execute: async (...args: unknown[]) => {
      const enabled = args[0];
      if (typeof enabled !== "boolean") return;

      // The store first, unconditionally: it is what the next run reads, and
      // it must reflect the switch even when nothing is in flight to push to.
      chat_store.set_auto_approve(enabled);

      const session_id = chat_store.active?.agent_session_id;
      if (!session_id) return;
      try {
        // Turning it on here is also the answer to any prompt this session
        // has parked — the backend decides those rather than leaving the run
        // blocked on a question the user just answered globally. A false
        // reply means there was no live run to tell, which matters when the
        // flip was made from inside a prompt that is now waiting on it.
        const reached = await permissions.set_auto_approve(session_id, enabled);
        if (!reached && enabled) {
          toast.error("This agent run has ended — answer it from a new turn");
        }
      } catch (e) {
        toast.error(error_message(e));
      }
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
      if (!id || stores.op.is_pending(CHAT_OP_KEY)) return;
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
      await drain_queued_prompts();
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
      stores.op.reset(CHAT_OP_KEY);
      persist_session(new_id);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_new_chat,
    label: "New Vault Chat",
    execute: () => {
      chat_store.start_new_session();
      stores.op.reset(CHAT_OP_KEY);
    },
  });

  registry.register({
    id: ACTION_IDS.rag_switch_session,
    label: "Switch Vault Chat Session",
    execute: (...args: unknown[]) => {
      const id = typeof args[0] === "string" ? args[0] : "";
      if (!id) return;
      chat_store.switch_session(id);
      stores.op.reset(CHAT_OP_KEY);
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
      stores.op.reset(CHAT_OP_KEY);
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
