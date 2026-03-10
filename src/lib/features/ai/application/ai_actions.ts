import { toast } from "svelte-sonner";
import type { ActionRegistrationInput } from "$lib/app";
import { ACTION_IDS } from "$lib/app";
import type {
  AiApplyTarget,
  AiProvider,
} from "$lib/features/ai/domain/ai_types";
import { AI_PROVIDER_DISPLAY } from "$lib/features/ai/domain/ai_types";
import type { AiService } from "$lib/features/ai/application/ai_service";
import type { AiStore } from "$lib/features/ai/state/ai_store.svelte";
import { error_message } from "$lib/shared/utils/error_message";

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

  function command_for(provider: AiProvider) {
    const settings = input.stores.ui.editor_settings;
    if (provider === "claude") return settings.ai_claude_command;
    if (provider === "codex") return settings.ai_codex_command;
    return settings.ai_ollama_command;
  }

  async function refresh_cli_status(provider: AiProvider, revision: number) {
    ai_store.set_cli_status("checking");

    if (provider === "ollama") {
      ai_store.set_ollama_model(
        input.stores.ui.editor_settings.ai_ollama_model,
      );
    }

    try {
      const available = await ai_service.check_cli(
        provider,
        command_for(provider),
      );
      if (revision !== dialog_revision) return;
      if (!ai_store.dialog.open || ai_store.dialog.provider !== provider) {
        return;
      }
      ai_store.set_cli_status(available ? "available" : "unavailable");
    } catch (error) {
      if (revision !== dialog_revision) return;
      if (!ai_store.dialog.open || ai_store.dialog.provider !== provider) {
        return;
      }
      ai_store.set_cli_status("error", error_message(error));
    }
  }

  async function open_ai_dialog(
    provider: AiProvider = ai_store.dialog.provider,
  ) {
    if (!ensure_ai_enabled()) return;

    const context = services.editor.get_ai_context();
    if (!context) {
      toast.info("Open a note first to use AI editing");
      return;
    }

    const selection = context.selection;
    ai_store.open_dialog(provider, {
      note_path: context.note_path,
      note_title: context.note_title,
      note_markdown: context.markdown,
      selection,
      target:
        selection && selection.text.trim() !== "" ? "selection" : "full_note",
    });

    const revision = ++dialog_revision;
    await refresh_cli_status(provider, revision);
  }

  function close_ai_dialog() {
    dialog_revision += 1;
    ai_store.close_dialog();
  }

  registry.register({
    id: ACTION_IDS.ai_open_assistant,
    label: "AI Assistant",
    execute: async () => {
      await open_ai_dialog();
    },
  });

  registry.register({
    id: ACTION_IDS.ai_open_claude,
    label: AI_PROVIDER_DISPLAY.claude.command_label,
    execute: async () => {
      await open_ai_dialog("claude");
    },
  });

  registry.register({
    id: ACTION_IDS.ai_open_codex,
    label: AI_PROVIDER_DISPLAY.codex.command_label,
    execute: async () => {
      await open_ai_dialog("codex");
    },
  });

  registry.register({
    id: ACTION_IDS.ai_open_ollama,
    label: AI_PROVIDER_DISPLAY.ollama.command_label,
    execute: async () => {
      await open_ai_dialog("ollama");
    },
  });

  registry.register({
    id: ACTION_IDS.ai_close_dialog,
    label: "Close AI Dialog",
    execute: () => {
      close_ai_dialog();
    },
  });

  registry.register({
    id: ACTION_IDS.ai_update_provider,
    label: "Update AI Provider",
    execute: async (provider: unknown) => {
      if (!ensure_ai_enabled()) return;
      const next_provider = String(provider) as AiProvider;
      if (
        next_provider !== "claude" &&
        next_provider !== "codex" &&
        next_provider !== "ollama"
      ) {
        return;
      }
      ai_store.set_provider(next_provider);
      if (!ai_store.dialog.open) {
        return;
      }
      const revision = ++dialog_revision;
      await refresh_cli_status(next_provider, revision);
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
    id: ACTION_IDS.ai_update_prompt,
    label: "Update AI Prompt",
    execute: (prompt: unknown) => {
      ai_store.set_prompt(String(prompt));
    },
  });

  registry.register({
    id: ACTION_IDS.ai_update_ollama_model,
    label: "Update Ollama Model",
    execute: (model: unknown) => {
      ai_store.set_ollama_model(String(model));
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
        toast.info("Describe how you want to edit the note");
        return;
      }

      const revision = dialog_revision;
      ai_store.start_execution();

      try {
        const result = await ai_service.execute({
          provider: dialog.provider,
          prompt: dialog.prompt,
          context: dialog.context,
          command: command_for(dialog.provider),
          ollama_model: dialog.ollama_model,
          timeout_seconds:
            input.stores.ui.editor_settings.ai_execution_timeout_seconds,
        });
        if (revision !== dialog_revision) return;
        if (
          !ai_store.dialog.open ||
          ai_store.dialog.provider !== dialog.provider
        )
          return;
        ai_store.finish_execution(result);
      } catch (error) {
        if (revision !== dialog_revision) return;
        if (
          !ai_store.dialog.open ||
          ai_store.dialog.provider !== dialog.provider
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
    execute: () => {
      const dialog = ai_store.dialog;
      if (!dialog.open || !dialog.context || !dialog.result?.success) return;

      const applied = services.editor.apply_ai_output(
        dialog.context.target,
        dialog.result.output,
        dialog.context.selection,
      );

      if (!applied) {
        toast.error("Failed to apply AI edit");
        return;
      }

      toast.success(
        `${AI_PROVIDER_DISPLAY[dialog.provider].name} suggestion applied`,
      );
      close_ai_dialog();
    },
  });
}
