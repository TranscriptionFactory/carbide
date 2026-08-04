import type {
  AgentHarness,
  AiProviderConfig,
} from "$lib/shared/types/ai_provider_config";

export function provider_supports_streaming(config: AiProviderConfig): boolean {
  if (!config.transport) return false;
  if (config.transport.kind === "api") return true;
  return !config.transport.args.some((a) => a.includes("{output_file}"));
}

export type AgentBackend = "harness" | "native";

export type AgentCapability =
  | { backend: "native"; adapter?: undefined }
  | { backend: "harness"; adapter: AgentHarness };

export const HARNESS_LABELS: Record<AgentHarness, string> = {
  claude: "Claude Code",
  codex: "Codex",
};

export function agent_capability(
  config: AiProviderConfig,
): AgentCapability | null {
  if (!config.transport) return null;
  if (config.transport.kind === "api") return { backend: "native" };
  if (config.transport.harness)
    return { backend: "harness", adapter: config.transport.harness };
  return null;
}
