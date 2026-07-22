import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

export function provider_supports_streaming(config: AiProviderConfig): boolean {
  if (config.transport.kind === "api") return true;
  return !config.transport.args.some((a) => a.includes("{output_file}"));
}

export function provider_supports_agent(config: AiProviderConfig): boolean {
  return config.id === "claude";
}

export function agent_backend(
  config: AiProviderConfig,
): "harness" | "native" | null {
  if (config.id === "claude") return "harness";
  if (config.transport.kind === "api") return "native";
  return null;
}
