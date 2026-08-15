import { toast } from "$lib/shared/ui/toast";
import { create_logger } from "$lib/shared/utils/logger";
import YAML from "yaml";
import type { ActionRegistrationInput } from "$lib/app";
import { ACTION_IDS } from "$lib/app";
import type { AiVaultContext } from "$lib/features/ai/domain/ai_types";
import { find_provider } from "$lib/features/ai/domain/ai_types";
import {
  preferred_ai_backend_order,
  resolve_auto_ai_backend,
} from "$lib/features/ai/domain/ai_backend_selection";
import {
  agent_capability,
  provider_supports_streaming,
  supports_vault_handoff,
} from "$lib/features/ai/domain/ai_provider_capabilities";
import type { AiService } from "$lib/features/ai/application/ai_service";
import type { AgenticEditRunner } from "$lib/features/ai/application/agentic_edit_runner";
import {
  error_message,
  strip_invoke_prefix,
} from "$lib/shared/utils/error_message";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import { extract_frontmatter } from "$lib/features/reference";
import {
  as_markdown_text,
  type MarkdownText,
  type NoteId,
  type NotePath,
} from "$lib/shared/types/ids";
import {
  dispatch_ai_menu,
  get_ai_menu_state,
  ai_menu_plugin_key,
  reject_ai_inline,
  resolve_inline_ai_anchor_coords,
} from "$lib/features/editor";
import type { EditorSelectionSnapshot } from "$lib/shared/types/editor";
import type {
  AssistantProposalStore,
  AssistantSessionService,
  AssistantSessionStore,
  RunHandle,
} from "$lib/features/assistant";
import { build_ai_inline_prompt } from "$lib/features/ai/domain/ai_prompt_builder";
import { sanitize_ai_output } from "$lib/features/ai/domain/ai_output_sanitizer";
import {
  build_inline_messages,
  derive_inline_title,
  describe_inline_request,
  type InlineRequestPayload,
} from "$lib/features/ai/domain/inline_session_log";
import {
  build_editor_sources,
  type EditorContextMaterial,
} from "$lib/features/ai/domain/ai_context_sources";
import { build_proposal } from "$lib/features/ai/domain/ai_diff";
import {
  resolve_instructions,
  resolve_policy,
} from "$lib/shared/domain/prompt_recipes";
import type {
  AssistantSurface,
  ContextSourceId,
  InstructionRecipe,
} from "$lib/shared/types/prompt_recipe";
import { assemble_context, context_window } from "$lib/features/assistant";
import { collect_open_note_image_parts } from "$lib/features/ai/application/note_image_loader";
import type { EditorView } from "prosemirror-view";

const log = create_logger("ai_actions");

const MAX_INLINE_CONTEXT = 4000;

// One object per inline request, captured by the handler that created it. A
// module-level snapshot shared by every run let an accept in note B diff
// against note A's markdown, which builds a "delete all of B" proposal.
type InlineRun = {
  request: { prompt: string; provider_id: string; note_path?: string };
  // Minted when the run starts, so a run that is rejected, fails or has its
  // surface closed is still addressable. `session_settled` records that the
  // reply has been written: the first terminal state wins, and a detached
  // stream arriving afterwards must not overwrite it.
  session_id: string | null;
  session_settled: boolean;
  before_markdown: string | null;
  prompts: { system_prompt: string; user_prompt: string } | null;
};

type InlineOutcome = { stopped: true } | { error: string };

type PendingInlinePrompt = {
  command_id: string;
  commands: InstructionRecipe[];
  material: EditorContextMaterial;
  declared: ContextSourceId[];
  custom_prompt?: string;
};

function extract_source_inline_context(
  markdown: string,
  selection: EditorSelectionSnapshot | null,
  cursor_offset: number,
): EditorContextMaterial {
  if (selection && selection.start !== null && selection.end !== null) {
    const w = context_window(
      selection.start,
      selection.end,
      markdown.length,
      MAX_INLINE_CONTEXT,
    );
    return {
      cursor_window: markdown.slice(w.start, w.end),
      selection: selection.text,
    };
  }
  const w = context_window(
    cursor_offset,
    null,
    markdown.length,
    MAX_INLINE_CONTEXT,
  );
  return { cursor_window: markdown.slice(w.start, w.end) };
}

export function register_ai_actions(
  input: ActionRegistrationInput & {
    ai_service: AiService;
    agentic_runner: AgenticEditRunner;
    assistant_sessions: AssistantSessionStore;
    assistant_proposals: AssistantProposalStore;
    assistant_sessions_service: AssistantSessionService;
  },
) {
  const {
    registry,
    services,
    ai_service,
    agentic_runner,
    assistant_sessions,
    assistant_proposals,
    assistant_sessions_service,
  } = input;

  // The most recent inline request. `before_markdown` is the note's full
  // markdown before that attempt started (captured once per fresh request, not
  // per retry) — I5's base_revision for the proposal built at accept.
  let inline_run: InlineRun | null = null;

  function ai_enabled() {
    return input.stores.ui.editor_settings.ai_enabled;
  }

  function ensure_ai_enabled() {
    if (ai_enabled()) {
      return true;
    }
    toast.info("AI Assistant is disabled in settings");
    return false;
  }

  function get_providers() {
    return input.stores.ui.editor_settings.ai_providers;
  }

  function get_provider(id: string): AiProviderConfig | undefined {
    return find_provider(get_providers(), id);
  }

  async function resolve_provider(
    transport_kind?: "cli" | "api",
  ): Promise<AiProviderConfig | null> {
    let providers = get_providers();
    if (transport_kind) {
      providers = providers.filter((p) => p.transport.kind === transport_kind);
    }
    const settings = input.stores.ui.editor_settings;
    const default_id = settings.ai_default_provider_id;
    if (default_id === "auto") {
      const auto = await resolve_auto_ai_backend({
        providers,
        detect_status: async (cfg) => (await ai_service.detect(cfg)).status,
      });
      return auto ?? null;
    }
    const match = providers.find((p) => p.id === default_id);
    return match ?? null;
  }

  async function fetch_inline_vault_context(): Promise<
    AiVaultContext | undefined
  > {
    const settings = input.stores.ui.editor_settings;
    if (!settings.ai_inline_vault_context) return undefined;
    const editor_ctx = services.editor.get_ai_context();
    if (!editor_ctx) return undefined;
    return await ai_service.fetch_vault_context(editor_ctx.note_path, {
      enabled: true,
      similar_limit: settings.ai_vault_context_similar_limit,
      include_links: settings.ai_vault_context_include_links,
      similarity_threshold: settings.ai_vault_context_similarity_threshold,
    });
  }

  async function resolve_streaming_provider(): Promise<AiProviderConfig | null> {
    const resolved = await resolve_provider();
    if (resolved && provider_supports_streaming(resolved)) {
      return resolved;
    }
    const order = preferred_ai_backend_order(
      input.stores.ui.editor_settings.ai_default_provider_id,
      get_providers(),
    );
    return order.find(provider_supports_streaming) ?? null;
  }

  function get_inline_view(): EditorView | null {
    return services.editor.get_editor_view();
  }

  // On stream failure keep any partial output reviewable (accept/discard);
  // with nothing streamed, reject to restore the doc (a selection may have
  // been deleted when the stream started).
  function fail_inline_stream(
    view: EditorView,
    run: InlineRun,
    streamed: string,
    message: string,
  ) {
    finish_inline_session(run, streamed, { error: message });
    toast.error(message);
    const state = get_ai_menu_state(view.state);
    if (!state.open) return;
    if (state.ai_range_to > state.ai_range_from) {
      dispatch_ai_menu(view, { action: "stream_done" });
    } else {
      reject_ai_inline(view);
    }
  }

  // The plugin tracks the streamed range by accumulating inserted lengths, so a
  // rewrite has to replay through the same retry/stream_text metas rather than
  // editing the doc behind its back.
  function rewrite_streamed_text(
    view: EditorView,
    streamed: string,
    next_text: string,
  ) {
    if (next_text === streamed) return;
    const state = get_ai_menu_state(view.state);
    if (!state.open) return;

    const cleared = view.state.tr.delete(
      state.ai_range_from,
      state.ai_range_to,
    );
    cleared.setMeta("addToHistory", false);
    cleared.setMeta(ai_menu_plugin_key, { action: "retry" });
    view.dispatch(cleared);
    if (!next_text) return;

    const inserted = view.state.tr.insertText(
      next_text,
      get_ai_menu_state(view.state).ai_range_to,
    );
    inserted.setMeta("addToHistory", false);
    inserted.setMeta(ai_menu_plugin_key, {
      action: "stream_text",
      text: next_text,
    });
    view.dispatch(inserted);
  }

  function extract_inline_context(view: EditorView): EditorContextMaterial {
    const { from, to } = view.state.selection;
    const doc = view.state.doc;
    if (from !== to) {
      const w = context_window(from, to, doc.content.size, MAX_INLINE_CONTEXT);
      return {
        cursor_window: doc.textBetween(w.start, w.end, "\n", "\n"),
        selection: doc.textBetween(from, to, "\n", "\n"),
      };
    }
    const w = context_window(from, null, doc.content.size, MAX_INLINE_CONTEXT);
    return {
      cursor_window: doc.textBetween(w.start, w.end, "\n", "\n"),
    };
  }

  function in_source_mode(): boolean {
    return input.stores.editor.editor_mode === "source";
  }

  // Split in two because the editor material must be read before the stream
  // transaction mutates the doc, while vault context only arrives after an
  // await. Assembly happens once both halves are in hand.
  function prepare_inline_prompt(
    surface: AssistantSurface,
    material: EditorContextMaterial,
    p: { command_id?: string; prompt?: string } | undefined,
    commands: InstructionRecipe[],
  ): PendingInlinePrompt {
    const command_id = p?.command_id ?? (p?.prompt ? "custom" : "continue");
    const policy = resolve_policy(
      commands.find((c) => c.id === command_id),
      surface,
    );
    return {
      command_id,
      commands,
      material,
      declared: policy.context_sources,
      ...(p?.prompt ? { custom_prompt: p.prompt } : {}),
    };
  }

  function finish_inline_prompt(
    pending: PendingInlinePrompt,
    vault_context: AiVaultContext | undefined,
  ): { system_prompt: string; user_prompt: string } {
    const assembly = assemble_context(
      build_editor_sources(pending.declared, {
        ...pending.material,
        ...(vault_context ? { vault: vault_context } : {}),
      }),
      null,
    );
    return build_ai_inline_prompt({
      command_id: pending.command_id,
      commands: pending.commands,
      assembly,
      ...(pending.custom_prompt !== undefined
        ? { custom_prompt: pending.custom_prompt }
        : {}),
    });
  }

  registry.register({
    id: ACTION_IDS.ai_open_inline_menu,
    label: "Open Inline AI Menu",
    execute: () => {
      if (!ensure_ai_enabled()) return;
      const view = get_inline_view();
      if (!view) return;
      const menu_state = get_ai_menu_state(view.state);
      if (menu_state.open && !menu_state.streaming) {
        const textarea = document.querySelector(
          ".AiInlineMenu__textarea",
        ) as HTMLTextAreaElement | null;
        textarea?.focus();
        return;
      }
      const anchor_coords = resolve_inline_ai_anchor_coords({
        mode: input.stores.editor.editor_mode,
        visual_view: view,
        source_view: input.stores.editor.source_view_getter?.() ?? null,
      });
      if (!anchor_coords) {
        toast.info("Place the cursor in the editor to use inline AI");
        return;
      }
      dispatch_ai_menu(view, { action: "open", anchor_coords });
    },
  });

  // CodeMirror has no AI stream decorations; source mode collects the whole
  // stream and applies it through the store-backed source branch on completion.
  async function execute_inline_source(
    view: EditorView,
    config: AiProviderConfig,
    p: { command_id?: string; prompt?: string; retry?: boolean } | undefined,
    commands: InstructionRecipe[],
    run: InlineRun,
  ) {
    const editor_ctx = services.editor.get_ai_context();
    if (!editor_ctx) {
      dispatch_ai_menu(view, { action: "close" });
      return;
    }
    const selection = editor_ctx.selection;
    const cursor_offset = input.stores.editor.cursor_offset;

    let pending: PendingInlinePrompt | null = null;
    if (p?.retry) {
      if (!run.prompts) return;
    } else {
      pending = prepare_inline_prompt(
        "inline_cm",
        extract_source_inline_context(
          editor_ctx.markdown,
          selection,
          cursor_offset,
        ),
        p,
        commands,
      );
    }

    dispatch_ai_menu(view, {
      action: "start_stream",
      anchor_pos: view.state.selection.from,
    });

    const [images, vault_context] = await Promise.all([
      collect_open_note_image_parts(input),
      pending ? fetch_inline_vault_context() : undefined,
    ]);
    if (!get_ai_menu_state(view.state).open) return;
    let prompts = run.prompts;
    if (pending) {
      prompts = finish_inline_prompt(pending, vault_context);
      run.prompts = prompts;
    }
    if (!prompts) return;

    let output = "";
    try {
      for await (const chunk of ai_service.stream_inline({
        provider_config: config,
        system_prompt: prompts.system_prompt,
        user_prompt: prompts.user_prompt,
        images,
        note_path: String(editor_ctx.note_path),
        origin: inline_run_origin(run),
      })) {
        // I2: closing the menu detaches this surface. The run keeps going and
        // stays stoppable from the assistant popover.
        if (!get_ai_menu_state(view.state).open) {
          finish_inline_session(run, output, { stopped: true });
          return;
        }
        if (chunk.type === "text") {
          output += chunk.text;
        } else if (chunk.type === "error") {
          finish_inline_session(run, output, { error: chunk.error });
          toast.error(chunk.error);
          dispatch_ai_menu(view, { action: "close" });
          return;
        }
      }
    } catch (err) {
      const message = error_message(err);
      finish_inline_session(run, output, { error: message });
      toast.error(message);
      dispatch_ai_menu(view, { action: "close" });
      return;
    }
    // Detached after the last chunk: no further chunk will arrive to hit the
    // in-loop guard, and source mode has no accept or reject to settle it
    // later, so this is the run's only chance to record what it produced.
    if (!get_ai_menu_state(view.state).open) {
      finish_inline_session(run, output, { stopped: true });
      return;
    }

    const apply_selection = selection ?? {
      text: "",
      start: cursor_offset,
      end: cursor_offset,
    };
    // ALLOWED_DIRECT_APPLY: CodeMirror source-mode inline has no accept
    // affordance at all (filed C1 finding) — there is no review step to route
    // through a proposal. Do not invent one here; out of scope this cycle.
    // Sanitizing the accumulated stream is the only filter this path gets.
    const sanitized = sanitize_ai_output(output);
    const applied = services.editor.apply_ai_output(
      "selection",
      sanitized,
      apply_selection,
    );
    dispatch_ai_menu(view, { action: "close" });
    if (applied) {
      finish_inline_session(run, sanitized);
    } else {
      finish_inline_session(run, sanitized, {
        error: "Failed to apply AI edit",
      });
      toast.error("Failed to apply AI edit");
    }
  }

  // The base the accept proposal is diffed against, and the one the apply
  // service checks its base_revision against, have to be the same bytes. Disk
  // is that shared reference; the buffer is not, because it runs ahead of disk
  // whenever the note was dirty when the run started. Reading it here is safe
  // because the preview hold has already stopped autosave from moving it.
  async function read_note_from_disk(): Promise<MarkdownText | null> {
    const vault_id = input.stores.vault.active_vault_id;
    const note_path = services.editor.get_ai_context()?.note_path;
    if (!vault_id || !note_path) return null;
    try {
      const doc = await services.note.read_note(vault_id, note_path);
      return doc.markdown;
    } catch (error) {
      log.from_error("Inline AI could not read the note it started in", error);
      return null;
    }
  }

  registry.register({
    id: ACTION_IDS.ai_execute_inline,
    label: "Execute Inline AI",
    execute: async (payload: unknown) => {
      if (!ensure_ai_enabled()) return;
      const view = get_inline_view();
      if (!view) return;

      const p = payload as InlineRequestPayload | undefined;

      const config = await resolve_streaming_provider();
      if (!config) {
        toast.error(
          "No streaming-capable AI provider — inline edits need a Claude/Ollama CLI or API provider (Codex is agent-only). Add or select one in Settings.",
        );
        return;
      }

      // Resolved once, on the only path that reads it: the log label and the
      // prompt describe the same instruction set, so resolving twice would
      // invite them to disagree. Retry reuses the request and the prompts
      // already recorded and reads no instruction set at all, which is why
      // this stays inside the guard rather than above it.
      let commands: InstructionRecipe[] = [];

      // Retry reuses the request that is already recorded; overwriting it here
      // would lose the prompt, since a retry payload carries neither.
      if (!p?.retry) {
        commands = resolve_instructions(
          input.stores.ui.editor_settings.ai_inline_commands,
        );
        const request = {
          prompt: describe_inline_request(p, commands),
          provider_id: config.id,
          ...(input.stores.editor.open_note
            ? { note_path: String(input.stores.editor.open_note.meta.path) }
            : {}),
        };
        // Opened before the disk read rather than after it: a run whose note
        // cannot be read still happened, and a history that omits it is the
        // defect this replaces. The retry guard above is also what keeps a
        // retried run on the one session it opened.
        inline_run = {
          request,
          session_id: open_inline_session(request),
          session_settled: false,
          before_markdown: await read_note_from_disk(),
          prompts: null,
        };
      }
      // Held for the rest of this handler: a run detached mid-stream must keep
      // writing to its own state, never to whatever request came after it.
      const run = inline_run;
      if (!run) return;

      // read after the async provider probe: closes the double-trigger window
      const state = get_ai_menu_state(view.state);
      if (!state.open || state.streaming) return;

      if (in_source_mode()) {
        await execute_inline_source(view, config, p, commands, run);
        return;
      }

      let prompts = run.prompts;
      let pending: PendingInlinePrompt | null = null;
      if (p?.retry) {
        if (!prompts) return;
        const tr = view.state.tr.delete(state.ai_range_from, state.ai_range_to);
        tr.setMeta("addToHistory", false);
        tr.setMeta(ai_menu_plugin_key, { action: "retry" });
        view.dispatch(tr);
      } else {
        // Read the doc before the transaction below deletes the selection.
        pending = prepare_inline_prompt(
          "inline_pm",
          extract_inline_context(view),
          p,
          commands,
        );

        const { from, to } = view.state.selection;
        const tr = view.state.tr;
        if (from !== to) tr.delete(from, to);
        tr.setMeta("addToHistory", false);
        tr.setMeta(ai_menu_plugin_key, {
          action: "start_stream",
          anchor_pos: from,
        });
        view.dispatch(tr);
      }

      const [images, vault_context] = await Promise.all([
        collect_open_note_image_parts(input),
        pending ? fetch_inline_vault_context() : undefined,
      ]);
      if (!get_ai_menu_state(view.state).open) return;
      if (pending) {
        prompts = finish_inline_prompt(pending, vault_context);
        run.prompts = prompts;
      }
      if (!prompts) return;

      let streamed = "";
      try {
        for await (const chunk of ai_service.stream_inline({
          provider_config: config,
          system_prompt: prompts.system_prompt,
          user_prompt: prompts.user_prompt,
          images,
          origin: inline_run_origin(run),
        })) {
          if (chunk.type === "text") {
            const current_state = get_ai_menu_state(view.state);
            // I2: the menu going away detaches this surface, it does not
            // cancel the run — the popover still owns Stop.
            if (!current_state.open) {
              finish_inline_session(run, streamed, { stopped: true });
              return;
            }
            // ALLOWED_DIRECT_APPLY: this raw transaction is the ProseMirror
            // live-insert preview (P3 ruling — unchanged this cycle). It is
            // not a note write: nothing here calls apply_ai_output or writes
            // through a note port, and the buffer stays unsaved until the
            // normal editor save/autosave flow picks it up. The persisted
            // write is ai_accept_inline's proposal accept, which is
            // checkpointed; this is the preview that write is taken from.
            const insert_pos = current_state.ai_range_to;
            const tr = view.state.tr.insertText(chunk.text, insert_pos);
            tr.setMeta("addToHistory", false);
            tr.setMeta(ai_menu_plugin_key, {
              action: "stream_text",
              text: chunk.text,
            });
            view.dispatch(tr);
            streamed += chunk.text;
          } else if (chunk.type === "error") {
            fail_inline_stream(view, run, streamed, chunk.error);
            return;
          }
        }
        // Detached on the final chunk: nothing after this reaches the in-loop
        // guard, and the rewrite and stream_done below both no-op on a closed
        // menu, so the session would never settle.
        if (!get_ai_menu_state(view.state).open) {
          finish_inline_session(run, streamed, { stopped: true });
          return;
        }
        // Sanitizing per chunk cannot work: a preamble spans chunk boundaries.
        // The completed stream is the first point the whole reply is in hand.
        rewrite_streamed_text(view, streamed, sanitize_ai_output(streamed));
        dispatch_ai_menu(view, { action: "stream_done" });
      } catch (err) {
        fail_inline_stream(view, run, streamed, error_message(err));
      }
    },
  });

  // The session opens with the run, not with the accept: a rejected, failed or
  // detached run is still something the user started and has to be able to
  // find. It holds the request and an empty reply until the run settles.
  // Vault-gated because only a vault has a place to persist it — an unwritable
  // session is the half-session this used to avoid by logging nothing.
  function open_inline_session(request: InlineRun["request"]): string | null {
    if (!input.stores.vault.active_vault_id) return null;

    const created = assistant_sessions.create({
      kind: "inline",
      title: derive_inline_title(request.prompt),
      provider_id: request.provider_id,
      ...(request.note_path
        ? { origin: { note_path: request.note_path } }
        : {}),
    });
    assistant_sessions.replace_messages(
      created.id,
      build_inline_messages(request.prompt, ""),
    );
    return created.id;
  }

  // Every terminal state routes here, so the transcript records what happened
  // rather than only what was accepted. Store writes stay in one tick; only
  // persistence is detached, and AssistantSessionService already swallows its
  // own failures.
  function finish_inline_session(
    run: InlineRun,
    result: string,
    outcome?: InlineOutcome,
  ): string | null {
    const vault_id = input.stores.vault.active_vault_id;
    if (!run.session_id || !vault_id) return null;
    // "Already written" and "has no session" are different answers. Returning
    // null for both let a second terminal state — accept after a failed stream
    // leaves the menu open — read as "no session" and skip the proposal
    // entirely, losing the staleness check and the review-centre record.
    if (run.session_settled) return run.session_id;

    run.session_settled = true;
    assistant_sessions.replace_messages(
      run.session_id,
      build_inline_messages(run.request.prompt, result).map((message) =>
        message.role === "assistant" ? { ...message, ...outcome } : message,
      ),
    );

    const stored = assistant_sessions.get(run.session_id);
    if (stored) void assistant_sessions_service.save_session(vault_id, stored);
    return run.session_id;
  }

  function inline_run_origin(run: InlineRun) {
    return {
      ...(run.request.note_path ? { note_path: run.request.note_path } : {}),
      ...(run.session_id ? { session_id: run.session_id } : {}),
    };
  }

  // The accept meta resets the plugin to its empty state, so the streamed
  // range has to be read before anything dispatches.
  function read_streamed_result(view: EditorView): string {
    const state = get_ai_menu_state(view.state);
    if (!state.open || state.ai_range_to <= state.ai_range_from) return "";
    return view.state.doc.textBetween(
      state.ai_range_from,
      state.ai_range_to,
      "\n",
      "\n",
    );
  }

  registry.register({
    id: ACTION_IDS.ai_accept_inline,
    label: "Accept Inline AI Result",
    execute: async () => {
      const view = get_inline_view();
      if (!view) return;

      const result = read_streamed_result(view);
      const run = inline_run;
      const after = services.editor.get_ai_context();

      // The snapshot accept diffs against belongs to the note the run started
      // in. Accepting into a different note would propose "delete all of this
      // note, insert all of that one"; only the base-revision staleness check
      // stands between that proposal and the disk.
      const origin_path = run?.request.note_path;
      if (
        result &&
        after &&
        origin_path &&
        origin_path !== String(after.note_path)
      ) {
        toast.error(
          `This inline edit was started in ${origin_path} — open that note to accept it.`,
        );
        return;
      }

      dispatch_ai_menu(view, { action: "accept" });
      if (!result || !run) return;

      const logged_session_id = finish_inline_session(run, result);

      // The toast is the immediate affordance; AU-012's ⌁ list row is the
      // durable one, so a missed toast loses nothing. The action opens the
      // read-only transcript tab it names — it has never opened the chat.
      if (logged_session_id) {
        toast.success("Inline edit applied", {
          action: {
            label: "View transcript",
            onClick: () =>
              void registry.execute(
                ACTION_IDS.assistant_open_session,
                logged_session_id,
              ),
          },
        });
      }

      // ALLOWED_DIRECT_APPLY: the streamed text is already in the editor
      // buffer — the ProseMirror menu previews it live as it arrives (P3
      // ruling, unchanged this cycle). Accept is what takes I5's checkpoint:
      // it re-diffs the note against its pre-stream snapshot and routes the
      // write through the proposal store, so the buffer preview and the
      // persisted write share one apply path even though they happen at
      // different times.
      if (run.before_markdown != null && after && logged_session_id) {
        // The review centre groups by origin.session_id. Both the snapshot and
        // the session are minted when the run starts, so a run that has one
        // has the other — the proposal never needs a stand-in id.
        const proposal = build_proposal({
          target: { kind: "note", note_path: after.note_path },
          original_text: run.before_markdown,
          draft_text: after.markdown,
          span: "full_note",
          origin: { session_id: logged_session_id, run_id: null },
        });
        assistant_proposals.add(proposal);
        await registry.execute(
          ACTION_IDS.assistant_accept_proposal,
          proposal.id,
        );
      }
    },
  });

  registry.register({
    id: ACTION_IDS.ai_reject_inline,
    label: "Reject Inline AI Result",
    execute: () => {
      const view = get_inline_view();
      if (!view) return;
      const run = inline_run;
      const discarded = read_streamed_result(view);
      reject_ai_inline(view);
      // A discarded draft is still the answer this run produced. Keeping it in
      // the transcript is what makes "what did that suggest again?" answerable
      // after the document has moved on.
      if (run) finish_inline_session(run, discarded, { stopped: true });
    },
  });

  registry.register({
    id: ACTION_IDS.ai_set_inline_preview,
    label: "Set Inline AI Preview State",
    execute: (...args: unknown[]) => {
      input.stores.editor.set_ai_preview_active(args[0] === true);
    },
  });

  registry.register({
    id: ACTION_IDS.ai_close_inline_menu,
    label: "Close Inline AI Menu",
    execute: () => {
      const view = get_inline_view();
      if (!view) return;
      dispatch_ai_menu(view, { action: "close" });
    },
  });

  registry.register({
    id: ACTION_IDS.ai_open_vault_in_agent,
    label: "Open Vault in Agent Terminal",
    execute: async () => {
      if (!ensure_ai_enabled()) return;
      const provider = await resolve_provider("cli");
      if (!provider) {
        toast.error("No AI provider configured");
        return;
      }
      if (!supports_vault_handoff(agent_capability(provider))) {
        toast.info(
          `${provider.name} does not support vault handoff — requires Claude Code`,
        );
        return;
      }
      const vault = input.stores.vault.vault;
      if (!vault) return;
      try {
        await ai_service.open_vault_in_agent(provider, String(vault.path));
      } catch (e) {
        toast.error(strip_invoke_prefix(error_message(e)));
      }
    },
  });

  registry.register({
    id: ACTION_IDS.ai_generate_description,
    label: "Generate Description with AI",
    execute: async (payload: unknown) => {
      if (!ensure_ai_enabled()) return;

      const note_path =
        typeof payload === "string"
          ? payload
          : (payload as { path?: string })?.path;
      if (!note_path) return;

      const vault = input.stores.vault.vault;
      if (!vault) return;

      const providers = get_providers();
      const settings = input.stores.ui.editor_settings;
      let resolved_provider_id = settings.ai_default_provider_id;
      if (resolved_provider_id === "auto") {
        const auto_provider = await resolve_auto_ai_backend({
          providers,
          detect_status: async (cfg) => (await ai_service.detect(cfg)).status,
        });
        resolved_provider_id = auto_provider?.id ?? "";
      }
      if (!resolved_provider_id) {
        toast.error("No AI provider configured");
        return;
      }
      const config = get_provider(resolved_provider_id);
      if (!config) {
        toast.error(`AI provider "${resolved_provider_id}" not found`);
        return;
      }

      const generating = toast.loading("Generating description…");

      try {
        const doc = await services.note.read_note(
          vault.id,
          note_path as NoteId,
        );

        let handle: RunHandle | null = null;
        const result = await ai_service.execute_streaming({
          provider_config: config,
          prompt:
            "Write a single-sentence summary (under 80 characters) of this note. " +
            "Return ONLY the summary text CONTENT, no quotes, no prefix, no explanation. Do not include prefixes like 'Summary:' or 'Description:'.",
          context: {
            kind: "note",
            note_path: note_path as NotePath,
            note_title: doc.meta.title,
            note_markdown: doc.markdown,
            selection: null,
            target: "full_note",
          },
          mode: "ask",
          timeout_seconds: settings.ai_execution_timeout_seconds,
          vault_context_settings: {
            enabled: settings.ai_vault_context_enabled,
            similar_limit: settings.ai_vault_context_similar_limit,
            include_links: settings.ai_vault_context_include_links,
            similarity_threshold:
              settings.ai_vault_context_similarity_threshold,
          },
          run: { kind: "background", label: "Generate description" },
          on_run_started: (started) => {
            handle = started;
          },
        });

        // A stopped run reports success with whatever text arrived first, so
        // without this the note gets half a sentence written into it. The cast
        // restores the type the callback assigns; flow analysis cannot see it.
        const outcome = await (handle as RunHandle | null)?.outcome;
        if (outcome?.status === "aborted") {
          toast.dismiss(generating);
          return;
        }

        if (!result.success) {
          toast.dismiss(generating);
          toast.error(result.error ?? "AI failed to generate description");
          return;
        }

        const description = result.output.trim().replace(/^["']|["']$/g, "");
        const { yaml: yaml_str, body } = extract_frontmatter(doc.markdown);
        const frontmatter = yaml_str.trim() ? (YAML.parse(yaml_str) ?? {}) : {};
        frontmatter.description = description;
        const updated_yaml = YAML.stringify(frontmatter, {
          lineWidth: 0,
        }).trimEnd();
        const updated_markdown = as_markdown_text(
          `---\n${updated_yaml}\n---\n${body}`,
        );

        await services.note.write_note_indexed(
          vault.id,
          note_path as NoteId,
          updated_markdown,
        );

        toast.dismiss(generating);
        toast.success("Description generated");
      } catch (err) {
        toast.dismiss(generating);
        toast.error(error_message(err));
      }
    },
  });
}
