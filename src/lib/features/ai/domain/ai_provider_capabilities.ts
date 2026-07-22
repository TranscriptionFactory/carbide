import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

export function provider_supports_streaming(config: AiProviderConfig): boolean {
  if (config.transport.kind === "api") return true;
  return !config.transport.args.some((a) => a.includes("{output_file}"));
}

export function provider_supports_agent(config: AiProviderConfig): boolean {
  return config.id === "claude";
}
