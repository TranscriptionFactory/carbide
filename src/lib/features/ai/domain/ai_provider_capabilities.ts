import {
  BUILTIN_PROVIDER_PRESETS,
  type AgentDescriptor,
  type AiProviderConfig,
} from "$lib/shared/types/ai_provider_config";

export function provider_supports_streaming(config: AiProviderConfig): boolean {
  if (config.transport.kind === "api") return true;
  return !config.transport.args.some((a) => a.includes("{output_file}"));
}

export type AgentBackend = "harness" | "native";

export type AgentCapability = { backend: AgentBackend; adapter?: string };

export function infer_agent_descriptor(
  config: AiProviderConfig,
): AgentDescriptor {
  const preset = BUILTIN_PROVIDER_PRESETS.find((p) => p.id === config.id);
  if (preset?.agent) return preset.agent;
  if (config.transport.kind === "api") return { kind: "openai_compat" };
  return { kind: "text_cli" };
}

export function agent_capability(
  config: AiProviderConfig,
): AgentCapability | null {
  const descriptor = config.agent ?? infer_agent_descriptor(config);
  switch (descriptor.kind) {
    case "claude_code":
      return { backend: "harness", adapter: "claude" };
    case "openai_compat":
      return { backend: "native" };
    case "codex_cli":
      return { backend: "harness", adapter: "codex" };
    case "text_cli":
      return null;
  }
}
