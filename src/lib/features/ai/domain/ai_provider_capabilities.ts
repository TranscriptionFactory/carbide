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

// The one statement of what each backend's agent may actually touch. Every
// surface that describes the grant (header badge, Power hint, empty state)
// reads from here, so the copy cannot drift into understating a harness's
// unrestricted shell access.
export type AgentScopeCopy = {
  badge: string;
  badge_title: string;
  power_hint: string;
  empty_state: string;
};

export function agent_scope_copy(capability: AgentCapability): AgentScopeCopy {
  if (capability.backend === "native") {
    return {
      badge: "vault-scoped",
      badge_title: "Agent can only use vault tools",
      power_hint: "Agent can edit files in your vault",
      empty_state:
        "Agent edits files in your vault. Safe mode limits it to note tools.",
    };
  }
  return {
    badge: "full access",
    badge_title: `${HARNESS_LABELS[capability.adapter]} agent with full system access`,
    power_hint:
      "Full system access — agent can run shell commands outside the vault",
    empty_state:
      "Agent has full system access. Safe mode limits it to note tools.",
  };
}

export function agent_capability(
  config: AiProviderConfig,
): AgentCapability | null {
  if (!config.transport) return null;
  if (config.transport.kind === "api") return { backend: "native" };
  if (config.transport.harness)
    return { backend: "harness", adapter: config.transport.harness };
  return null;
}
