import type { AcpPresetId } from "$lib/generated/bindings";
import type {
  AcpAgentSpec,
  AiProviderConfig,
  AiTransport,
} from "$lib/shared/types/ai_provider_config";

// The two transports are disjoint — cli carries command/args/acp, api carries
// base_url/api_key_env — so a kind change cannot preserve the other shape's
// fields and starts them blank. Re-selecting the current kind is identity,
// which is what keeps an existing acp spec from being dropped on a no-op edit.
export function with_transport_kind(
  config: AiProviderConfig,
  kind: AiTransport["kind"],
): AiProviderConfig {
  if (config.transport?.kind === kind) return config;
  const transport: AiTransport =
    kind === "api"
      ? { kind: "api", base_url: "" }
      : { kind: "cli", command: "", args: [] };
  return { ...config, transport };
}

export function provider_supports_streaming(config: AiProviderConfig): boolean {
  if (!config.transport) return false;
  if (config.transport.kind === "api") return true;
  return !config.transport.args.some((a) => a.includes("{output_file}"));
}

export type AgentCapability =
  | { backend: "native"; acp?: undefined }
  | { backend: "acp"; acp: AcpAgentSpec };

export const ACP_PRESET_LABELS: Record<AcpPresetId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  opencode: "opencode",
  pi: "pi",
};

export function acp_agent_label(spec: AcpAgentSpec): string {
  return spec.kind === "preset" ? ACP_PRESET_LABELS[spec.id] : spec.command;
}

export function agent_capability(
  config: AiProviderConfig,
): AgentCapability | null {
  if (!config.transport) return null;
  if (config.transport.kind === "api") return { backend: "native" };
  if (config.transport.acp)
    return { backend: "acp", acp: config.transport.acp };
  return null;
}

// Handing the vault to a terminal agent needs a CLI that takes a directory
// argument and speaks the same session; only the Claude preset does.
export function supports_vault_handoff(
  capability: AgentCapability | null,
): boolean {
  return (
    capability?.backend === "acp" &&
    capability.acp.kind === "preset" &&
    capability.acp.id === "claude"
  );
}

// The one statement of what each backend's agent may actually touch. Every
// surface that describes the grant (header badge, auto-approve hint, empty
// state) reads from here, so the copy cannot drift into understating an ACP
// agent's unrestricted shell access.
export type AgentScopeCopy = {
  badge: string;
  badge_title: string;
  auto_approve_hint: string;
  empty_state: string;
};

export function agent_scope_copy(capability: AgentCapability): AgentScopeCopy {
  if (capability.backend === "native") {
    return {
      badge: "vault-scoped",
      badge_title: "Agent can only use vault tools",
      auto_approve_hint:
        "Run edits and commands without asking. Change it any time.",
      empty_state:
        "Agent edits files in your vault. It asks before each edit unless auto-approve is on.",
    };
  }
  return {
    badge: "full access",
    badge_title: `${acp_agent_label(capability.acp)} agent with full system access`,
    auto_approve_hint:
      "Run edits and commands on this whole system without asking. Change it any time.",
    empty_state:
      "Agent has full system access. It asks before each risky call unless auto-approve is on.",
  };
}
