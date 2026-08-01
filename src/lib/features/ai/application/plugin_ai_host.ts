import { derive_provider_hint } from "$lib/features/ai/domain/ai_provider_hint";
import type {
  AiExecutionResult,
  AiMode,
} from "$lib/features/ai/domain/ai_types";
import type { AiProviderHint } from "$lib/features/plugin";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { MarkdownText, NotePath } from "$lib/shared/types/ids";

export type PluginAiExecuteInput = {
  prompt: string;
  mode?: AiMode;
};

export type PluginAiHostDeps = {
  ai_enabled: () => boolean;
  default_provider_id: () => string;
  execution_timeout_seconds: () => number | null;
  resolve_provider: (requested_id: string) => Promise<AiProviderConfig | null>;
  vault_path: () => string | null;
  open_note: () => {
    path: NotePath;
    title: string;
    markdown: MarkdownText;
  } | null;
  execute: (input: {
    provider_config: AiProviderConfig;
    prompt: string;
    context: {
      kind: "note";
      note_path: NotePath;
      note_title: string;
      note_markdown: MarkdownText;
      selection: null;
      target: "full_note";
    };
    mode: AiMode;
    timeout_seconds: number | null;
  }) => Promise<AiExecutionResult>;
};

export type PluginAiHost = {
  execute: (input: PluginAiExecuteInput) => Promise<AiExecutionResult>;
  get_provider_hint: () => Promise<AiProviderHint>;
};

const UNKNOWN_HINT: AiProviderHint = {
  provider: "unknown",
  model: null,
  api_key_env: null,
  base_url: null,
};

// I3: both entry points resolve through the one provider rule. They used to
// take providers[0] for `auto` with no availability probe, so a plugin could be
// handed a provider whose CLI was not installed.
export function create_plugin_ai_host(deps: PluginAiHostDeps): PluginAiHost {
  return {
    async execute(input) {
      if (!deps.ai_enabled()) {
        return {
          success: false,
          output: "",
          error: "AI is disabled in settings",
        };
      }

      const provider = await deps.resolve_provider(deps.default_provider_id());
      if (!provider) {
        return {
          success: false,
          output: "",
          error: "No AI provider configured",
        };
      }

      if (deps.vault_path() === null) {
        return { success: false, output: "", error: "No active vault" };
      }

      const open_note = deps.open_note();
      return await deps.execute({
        provider_config: provider,
        prompt: input.prompt,
        context: {
          kind: "note",
          note_path: open_note?.path ?? ("" as NotePath),
          note_title: open_note?.title ?? "",
          note_markdown: open_note?.markdown ?? ("" as MarkdownText),
          selection: null,
          target: "full_note",
        },
        mode: input.mode ?? "ask",
        timeout_seconds: deps.execution_timeout_seconds(),
      });
    },

    async get_provider_hint() {
      if (!deps.ai_enabled()) return UNKNOWN_HINT;
      const provider = await deps.resolve_provider(deps.default_provider_id());
      if (!provider) return UNKNOWN_HINT;
      return derive_provider_hint(provider);
    },
  };
}
