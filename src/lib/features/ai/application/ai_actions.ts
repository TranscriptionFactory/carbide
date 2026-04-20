import { toast } from "svelte-sonner";
import YAML from "yaml";
import type { ActionRegistrationInput } from "$lib/app";
import { ACTION_IDS } from "$lib/app";
import type { AiApplyTarget, AiMode } from "$lib/features/ai/domain/ai_types";
import { find_provider } from "$lib/features/ai/domain/ai_types";
import { resolve_auto_ai_backend } from "$lib/features/ai/domain/ai_backend_selection";
import type { AiService } from "$lib/features/ai/application/ai_service";
import type { AiStore } from "$lib/features/ai/state/ai_store.svelte";
import { error_message } from "$lib/shared/utils/error_message";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import { extract_frontmatter } from "$lib/features/reference";
import {
  as_markdown_text,
  type NoteId,
  type NotePath,
} from "$lib/shared/types/ids";

export function register_ai_actions(
  input: ActionRegistrationInput & {
    ai_store: AiStore;
    ai_service: AiService;
  },
) {
  const { registry, services, ai_service, ai_store } = input;
  let dialog_revision = 0;

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

  async function refresh_cli_status(provider_id: string, revision: number) {
    ai_store.set_cli_status("checking");

    const config = get_provider(provider_id);
    if (!config) {
      ai_store.set_cli_status(
        "error",
        `Provider "${provider_id}" not found in settings.`,
      );
      return;
    }

    try {
      const available = await ai_service.check_availability(config);
      if (revision !== dialog_revision) return;
      if (
        !ai_store.dialog.open ||
        ai_store.dialog.provider_id !== provider_id
      ) {
        return;
      }
      ai_store.set_cli_status(available ? "available" : "unavailable");
    } catch (error) {
      if (revision !== dialog_revision) return;
      if (
        !ai_store.dialog.open ||
        ai_store.dialog.provider_id !== provider_id
      ) {
        return;
      }
      ai_store.set_cli_status("error", error_message(error));
    }
  }

  async function open_ai_dialog(provider_id?: string) {
    if (!ensure_ai_enabled()) return;

    const context = services.editor.get_ai_context();
    if (!context) {
      if (ai_store.dialog.open && ai_store.dialog.context) {
        input.stores.ui.set_context_rail_tab("ai");
        return;
      }
      toast.info("Open a note first to use AI editing");
      return;
    }

    input.stores.ui.set_context_rail_tab("ai");

    if (
      ai_store.dialog.open &&
      ai_store.dialog.context?.note_path === context.note_path &&
      (provider_id === undefined || ai_store.dialog.provider_id === provider_id)
    ) {
      const selection = context.selection;
      ai_store.update_context({
        note_path: context.note_path,
        note_title: context.note_title,
        note_markdown: context.markdown,
        selection,
        target:
          selection && selection.text.trim() !== "" ? "selection" : "full_note",
      });

      if (ai_store.dialog.cli_status === "idle" && provider_id !== undefined) {
        const revision = ++dialog_revision;
        await refresh_cli_status(provider_id, revision);
      } else if (ai_store.dialog.cli_status === "idle") {
        const revision = ++dialog_revision;
        await refresh_cli_status(ai_store.dialog.provider_id, revision);
      }
      return;
    }

    let next_provider_id = provider_id;
    let preset_cli_status: "available" | "error" | null = null;
    let preset_cli_error: string | null = null;

    if (!next_provider_id) {
      const { ai_default_provider_id } = input.stores.ui.editor_settings;
      if (ai_default_provider_id === "auto") {
        const providers = get_providers();
        const auto_provider = await resolve_auto_ai_backend({
          providers,
          check_availability: async (config) =>
            await ai_service.check_availability(config),
        });

        if (auto_provider) {
          next_provider_id = auto_provider.id;
          preset_cli_status = "available";
        } else {
          next_provider_id = providers[0]?.id ?? "claude";
          preset_cli_status = "error";
          preset_cli_error =
            "No configured AI backend is currently available. Add a provider in Settings or install a supported CLI.";
        }
      } else {
        next_provider_id = ai_default_provider_id;
      }
    }

    const selection = context.selection;
    ai_store.open_dialog(next_provider_id, {
      note_path: context.note_path,
      note_title: context.note_title,
      note_markdown: context.markdown,
      selection,
      target:
        selection && selection.text.trim() !== "" ? "selection" : "full_note",
    });

    if (preset_cli_status === "available") {
      ai_store.set_cli_status("available");
      return;
    }

    if (preset_cli_status === "error") {
      ai_store.set_cli_status("error", preset_cli_error);
      return;
    }

    const revision = ++dialog_revision;
    await refresh_cli_status(next_provider_id, revision);
  }

  function close_ai_dialog() {
    dialog_revision += 1;
    ai_store.close_dialog();
    if (
      input.stores.ui.context_rail_open &&
      input.stores.ui.context_rail_tab === "ai"
    ) {
      input.stores.ui.toggle_context_rail();
    }
  }

  registry.register({
    id: ACTION_IDS.ai_open_assistant,
    label: "AI Assistant",
    execute: async () => {
      await open_ai_dialog();
    },
  });

  registry.register({
    id: ACTION_IDS.ai_open_with_provider,
    label: "AI Assistant (Provider)",
    execute: async (id: unknown) => {
      await open_ai_dialog(String(id));
    },
  });

  registry.register({
    id: ACTION_IDS.ai_close_dialog,
    label: "Reset AI Assistant Session",
    execute: () => {
      close_ai_dialog();
    },
  });

  registry.register({
    id: ACTION_IDS.ai_update_provider,
    label: "Update AI Provider",
    execute: async (id: unknown) => {
      if (!ensure_ai_enabled()) return;
      const provider_id = String(id);
      if (!get_provider(provider_id)) {
        return;
      }
      ai_store.set_provider(provider_id);
      if (!ai_store.dialog.open) {
        return;
      }
      const revision = ++dialog_revision;
      await refresh_cli_status(provider_id, revision);
    },
  });

  registry.register({
    id: ACTION_IDS.ai_update_mode,
    label: "Update AI Mode",
    execute: (mode: unknown) => {
      const next_mode = String(mode) as AiMode;
      if (next_mode !== "edit" && next_mode !== "ask") {
        return;
      }
      ai_store.set_mode(next_mode);
    },
  });

  registry.register({
    id: ACTION_IDS.ai_update_target,
    label: "Update AI Target",
    execute: (target: unknown) => {
      const next_target = String(target) as AiApplyTarget;
      if (next_target !== "selection" && next_target !== "full_note") {
        return;
      }
      const selection_text = ai_store.dialog.context?.selection?.text?.trim();
      if (next_target === "selection" && !selection_text) {
        return;
      }
      ai_store.set_target(next_target);
    },
  });

  registry.register({
    id: ACTION_IDS.ai_update_context,
    label: "Update AI Context",
    execute: (context: unknown) => {
      if (!context) return;
      ai_store.update_context(context as any);
    },
  });

  registry.register({
    id: ACTION_IDS.ai_update_prompt,
    label: "Update AI Prompt",
    execute: (prompt: unknown) => {
      ai_store.set_prompt(String(prompt));
    },
  });

  registry.register({
    id: ACTION_IDS.ai_clear_result,
    label: "Clear AI Result",
    execute: () => {
      ai_store.clear_result();
    },
  });

  registry.register({
    id: ACTION_IDS.ai_execute,
    label: "Execute AI Edit",
    execute: async () => {
      if (!ensure_ai_enabled()) return;
      const dialog = ai_store.dialog;
      if (!dialog.open || !dialog.context) return;
      if (dialog.is_executing) return;
      if (dialog.cli_status !== "available") return;
      if (dialog.prompt.trim() === "") {
        toast.info(
          dialog.mode === "ask"
            ? "Type a question about the note"
            : "Describe how you want to edit the note",
        );
        return;
      }

      const config = get_provider(dialog.provider_id);
      if (!config) {
        toast.error(`Provider "${dialog.provider_id}" not found in settings.`);
        return;
      }

      const revision = dialog_revision;
      ai_store.start_execution();

      try {
        const result = await ai_service.execute({
          provider_config: config,
          prompt: dialog.prompt,
          context: dialog.context,
          mode: dialog.mode,
          timeout_seconds:
            input.stores.ui.editor_settings.ai_execution_timeout_seconds,
        });
        if (revision !== dialog_revision) return;
        if (
          !ai_store.dialog.open ||
          ai_store.dialog.provider_id !== dialog.provider_id
        )
          return;
        ai_store.finish_execution(result);
      } catch (error) {
        if (revision !== dialog_revision) return;
        if (
          !ai_store.dialog.open ||
          ai_store.dialog.provider_id !== dialog.provider_id
        )
          return;
        ai_store.finish_execution({
          success: false,
          output: "",
          error: error_message(error),
        });
      }
    },
  });

  registry.register({
    id: ACTION_IDS.ai_apply_result,
    label: "Apply AI Result",
    execute: (output_override: unknown) => {
      const dialog = ai_store.dialog;
      if (!dialog.open || !dialog.context || !dialog.result?.success) return;
      const output =
        typeof output_override === "string"
          ? output_override
          : dialog.result.output;

      const applied = services.editor.apply_ai_output(
        dialog.context.target,
        output,
        dialog.context.selection,
      );

      if (!applied) {
        toast.error("Failed to apply AI edit");
        return;
      }

      const config = get_provider(dialog.provider_id);
      toast.success(`${config?.name ?? "AI"} suggestion applied`);
      close_ai_dialog();
    },
  });

  registry.register({
    id: ACTION_IDS.ai_open_inline_menu,
    label: "Open Inline AI Menu",
    execute: () => {
      if (!ensure_ai_enabled()) return;
    },
  });

  registry.register({
    id: ACTION_IDS.ai_execute_inline,
    label: "Execute Inline AI",
    execute: () => {
      if (!ensure_ai_enabled()) return;
    },
  });

  registry.register({
    id: ACTION_IDS.ai_accept_inline,
    label: "Accept Inline AI Result",
    execute: () => {},
  });

  registry.register({
    id: ACTION_IDS.ai_reject_inline,
    label: "Reject Inline AI Result",
    execute: () => {},
  });

  registry.register({
    id: ACTION_IDS.ai_close_inline_menu,
    label: "Close Inline AI Menu",
    execute: () => {},
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
          check_availability: async (cfg) =>
            await ai_service.check_availability(cfg),
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

        const result = await ai_service.execute({
          provider_config: config,
          prompt:
            "Write a single-sentence summary (under 80 characters) of this note. " +
            "Return ONLY the summary text CONTENT, no quotes, no prefix, no explanation. Do not include prefixes like 'Summary:' or 'Description:'.",
          context: {
            note_path: note_path as NotePath,
            note_title: doc.meta.title,
            note_markdown: doc.markdown,
            selection: null,
            target: "full_note",
          },
          mode: "ask",
          timeout_seconds: settings.ai_execution_timeout_seconds,
        });

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
