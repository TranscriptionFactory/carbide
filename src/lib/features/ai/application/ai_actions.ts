import { toast } from "$lib/shared/ui/toast";
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

const MAX_INLINE_CONTEXT = 4000;

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

  let last_inline_prompts: {
    system_prompt: string;
    user_prompt: string;
  } | null = null;
  let last_inline_request: {
    prompt: string;
    provider_id: string;
    note_path?: string;
  } | null = null;
  // Snapshot of the note's full markdown before the current inline attempt
  // started (captured once per fresh request, not per retry) — I5's
  // base_revision for the proposal built at accept.
  let last_inline_before_markdown: string | null = null;

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
  function fail_inline_stream(view: EditorView, message: string) {
    toast.error(message);
    const state = get_ai_menu_state(view.state);
    if (!state.open) return;
    if (state.ai_range_to > state.ai_range_from) {
      dispatch_ai_menu(view, { action: "stream_done" });
    } else {
      reject_ai_inline(view);
    }
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
      if (!last_inline_prompts) return;
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
    let prompts = last_inline_prompts;
    if (pending) {
      prompts = finish_inline_prompt(pending, vault_context);
      last_inline_prompts = prompts;
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
      })) {
        // I2: closing the menu detaches this surface. The run keeps going and
        // stays stoppable from the assistant popover.
        if (!get_ai_menu_state(view.state).open) {
          return;
        }
        if (chunk.type === "text") {
          output += chunk.text;
        } else if (chunk.type === "error") {
          toast.error(chunk.error);
          dispatch_ai_menu(view, { action: "close" });
          return;
        }
      }
    } catch (err) {
      toast.error(error_message(err));
      dispatch_ai_menu(view, { action: "close" });
      return;
    }
    if (!get_ai_menu_state(view.state).open) return;

    const apply_selection = selection ?? {
      text: "",
      start: cursor_offset,
      end: cursor_offset,
    };
    // ALLOWED_DIRECT_APPLY: CodeMirror source-mode inline has no accept
    // affordance at all (filed C1 finding) — there is no review step to route
    // through a proposal. Do not invent one here; out of scope this cycle.
    const applied = services.editor.apply_ai_output(
      "selection",
      output,
      apply_selection,
    );
    dispatch_ai_menu(view, { action: "close" });
    if (!applied) {
      toast.error("Failed to apply AI edit");
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
        last_inline_request = {
          prompt: describe_inline_request(p, commands),
          provider_id: config.id,
          ...(input.stores.editor.open_note
            ? { note_path: String(input.stores.editor.open_note.meta.path) }
            : {}),
        };
        last_inline_before_markdown =
          services.editor.get_ai_context()?.markdown ?? null;
      }

      // read after the async provider probe: closes the double-trigger window
      const state = get_ai_menu_state(view.state);
      if (!state.open || state.streaming) return;

      if (in_source_mode()) {
        await execute_inline_source(view, config, p, commands);
        return;
      }

      let prompts: { system_prompt: string; user_prompt: string } | null = null;
      let pending: PendingInlinePrompt | null = null;
      if (p?.retry) {
        if (!last_inline_prompts) return;
        prompts = last_inline_prompts;
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
        last_inline_prompts = prompts;
      }
      if (!prompts) return;

      try {
        for await (const chunk of ai_service.stream_inline({
          provider_config: config,
          system_prompt: prompts.system_prompt,
          user_prompt: prompts.user_prompt,
          images,
        })) {
          if (chunk.type === "text") {
            const current_state = get_ai_menu_state(view.state);
            // I2: the menu going away detaches this surface, it does not
            // cancel the run — the popover still owns Stop.
            if (!current_state.open) {
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
          } else if (chunk.type === "error") {
            fail_inline_stream(view, chunk.error);
            return;
          }
        }
        dispatch_ai_menu(view, { action: "stream_done" });
      } catch (err) {
        fail_inline_stream(view, error_message(err));
      }
    },
  });

  // Store writes stay in one tick so no observer can ever see a one-message
  // inline session; only persistence is detached, and AssistantSessionService
  // already swallows its own failures.
  function log_inline_session(result: string): string | null {
    const request = last_inline_request;
    const vault_id = input.stores.vault.active_vault_id;
    if (!request || !vault_id) return null;

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
      build_inline_messages(request.prompt, result),
    );

    // The toast is the immediate affordance; AU-012's ⌁ list row is the
    // durable one, so a missed toast loses nothing.
    toast.success("Inline edit applied", {
      action: {
        label: "Continue in chat",
        onClick: () =>
          void registry.execute(ACTION_IDS.assistant_open_session, created.id),
      },
    });

    const stored = assistant_sessions.get(created.id);
    if (stored) void assistant_sessions_service.save_session(vault_id, stored);
    return created.id;
  }

  registry.register({
    id: ACTION_IDS.ai_accept_inline,
    label: "Accept Inline AI Result",
    execute: async () => {
      const view = get_inline_view();
      if (!view) return;

      // The accept meta resets the plugin to its empty state, so the range has
      // to be read before dispatching.
      const state = get_ai_menu_state(view.state);
      const result =
        state.open && state.ai_range_to > state.ai_range_from
          ? view.state.doc.textBetween(
              state.ai_range_from,
              state.ai_range_to,
              "\n",
              "\n",
            )
          : "";

      dispatch_ai_menu(view, { action: "accept" });
      if (!result) return;

      const logged_session_id = log_inline_session(result);

      // ALLOWED_DIRECT_APPLY: the streamed text is already in the editor
      // buffer — the ProseMirror menu previews it live as it arrives (P3
      // ruling, unchanged this cycle). Accept is what takes I5's checkpoint:
      // it re-diffs the note against its pre-stream snapshot and routes the
      // write through the proposal store, so the buffer preview and the
      // persisted write share one apply path even though they happen at
      // different times.
      const after = services.editor.get_ai_context();
      if (last_inline_before_markdown !== null && after) {
        // The review centre groups by origin.session_id; a throwaway UUID
        // made every inline accept an unresolvable "raw id" group.
        const proposal = build_proposal({
          target: { kind: "note", note_path: after.note_path },
          original_text: last_inline_before_markdown,
          draft_text: after.markdown,
          span: "full_note",
          origin: {
            session_id: logged_session_id ?? crypto.randomUUID(),
            run_id: null,
          },
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
      reject_ai_inline(view);
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
      if (agent_capability(provider)?.backend !== "harness") {
        toast.info(`${provider.name} does not support agent mode`);
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
