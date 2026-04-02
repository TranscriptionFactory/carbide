import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { EditorSettings } from "$lib/shared/types/editor_settings";

export function resolve_iwe_ai_provider(
  settings: EditorSettings,
): AiProviderConfig | null {
  if (!settings.ai_enabled) return null;

  const providers = settings.ai_providers;
  const iwe_id = settings.iwe_ai_provider_id;
  const effective_id =
    iwe_id === "auto" ? settings.ai_default_provider_id : iwe_id;

  if (effective_id === "auto") {
    return providers.find((p) => p.transport.kind === "cli") ?? null;
  }
  return providers.find((p) => p.id === effective_id) ?? null;
}

export function is_output_file_provider(config: AiProviderConfig): boolean {
  return (
    config.transport.kind === "cli" &&
    config.transport.args.some((a) => a.includes("{output_file}"))
  );
}
