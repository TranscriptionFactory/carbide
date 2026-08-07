import {
  BUILTIN_PROVIDER_PRESETS,
  type AcpAgentSpec,
  type AiProviderConfig,
} from "$lib/shared/types/ai_provider_config";

type LegacyAiSettings = {
  ai_default_backend?: string;
  ai_claude_command?: string;
  ai_codex_command?: string;
  ai_ollama_command?: string;
  ai_ollama_model?: string;
};

type MigratedAiFields = {
  ai_providers: AiProviderConfig[];
  ai_default_provider_id: string;
};

type OldArgsTemplateProvider = {
  id: string;
  name: string;
  command: string;
  args_template: { kind: string; args?: string[] };
  model?: string;
  install_url?: string;
  is_preset?: boolean;
};

function migrate_old_args_template_provider(
  old: OldArgsTemplateProvider,
): AiProviderConfig {
  const preset = BUILTIN_PROVIDER_PRESETS.find((p) => p.id === old.id);
  if (preset) {
    const config = { ...preset };
    if (old.model) config.model = old.model;
    if (
      preset.transport.kind === "cli" &&
      old.command &&
      old.command !== preset.transport.command
    ) {
      config.transport = { ...preset.transport, command: old.command };
    }
    return config;
  }

  const args = old.args_template.args ?? [];
  return {
    id: old.id,
    name: old.name,
    transport: {
      kind: "cli",
      command: old.command,
      args,
    },
    ...(old.model ? { model: old.model } : {}),
    ...(old.install_url ? { install_url: old.install_url } : {}),
  };
}

function has_old_args_template_format(
  providers: unknown[],
): providers is OldArgsTemplateProvider[] {
  return providers.some(
    (p) =>
      typeof p === "object" &&
      p !== null &&
      "args_template" in p &&
      !("transport" in p),
  );
}

type WithLegacyAgent = AiProviderConfig & {
  agent?: { kind?: string };
  transport?: AiProviderConfig["transport"] & { harness?: string };
};

function preset_spec(id: string): AcpAgentSpec | undefined {
  return id === "claude" || id === "codex" ? { kind: "preset", id } : undefined;
}

// A provider that never carried either legacy marker is assumed to be the
// preset its id names, which is how pre-descriptor configs got their agent.
function infer_acp(
  agent: { kind?: string } | undefined,
  harness: string | undefined,
  id: string,
): AcpAgentSpec | undefined {
  const from_harness = harness !== undefined ? preset_spec(harness) : undefined;
  if (from_harness) return from_harness;
  if (agent?.kind === "claude_code") return preset_spec("claude");
  if (agent?.kind === "codex_cli") return preset_spec("codex");
  if (agent === undefined && harness === undefined) return preset_spec(id);
  return undefined;
}

// Returns the input by reference when nothing changes, so the caller's
// identity check doubles as the idempotency gate. Both legacy shapes — the
// agent descriptor and the harness field — convert straight to the ACP spec.
function convert_agent_descriptor(provider: WithLegacyAgent): AiProviderConfig {
  const { agent, ...config } = provider;
  const cli = config.transport?.kind === "cli" ? config.transport : null;
  const harness = cli?.harness;
  const acp =
    cli?.acp === undefined ? infer_acp(agent, harness, config.id) : undefined;

  if (!cli || (acp === undefined && harness === undefined)) {
    return agent === undefined ? provider : (config as AiProviderConfig);
  }

  const { harness: _dropped, ...transport } = cli;
  return {
    ...config,
    transport: acp === undefined ? transport : { ...transport, acp },
  } as AiProviderConfig;
}

export function migrate_ai_settings(
  raw: Record<string, unknown>,
): MigratedAiFields | null {
  if (Array.isArray(raw["ai_providers"])) {
    if (has_old_args_template_format(raw["ai_providers"])) {
      return {
        ai_providers: (raw["ai_providers"] as OldArgsTemplateProvider[]).map(
          migrate_old_args_template_provider,
        ),
        ai_default_provider_id:
          (raw["ai_default_provider_id"] as string) ?? "auto",
      };
    }
    const providers = raw["ai_providers"] as WithLegacyAgent[];
    const converted = providers.map(convert_agent_descriptor);
    if (converted.some((p, i) => p !== providers[i])) {
      return {
        ai_providers: converted,
        ai_default_provider_id:
          (raw["ai_default_provider_id"] as string) ?? "auto",
      };
    }
    return null;
  }

  const legacy = raw as LegacyAiSettings;
  const has_legacy =
    "ai_default_backend" in raw ||
    "ai_claude_command" in raw ||
    "ai_codex_command" in raw ||
    "ai_ollama_command" in raw ||
    "ai_ollama_model" in raw;

  if (!has_legacy) {
    return null;
  }

  const command_overrides: Record<string, string | undefined> = {
    claude: legacy.ai_claude_command,
    codex: legacy.ai_codex_command,
    ollama: legacy.ai_ollama_command,
  };

  const providers: AiProviderConfig[] = BUILTIN_PROVIDER_PRESETS.map(
    (preset) => {
      const copy = structuredClone(preset);
      const command = command_overrides[preset.id]?.trim();
      if (command && copy.transport.kind === "cli") {
        copy.transport = { ...copy.transport, command };
      }
      if (preset.id === "ollama" && legacy.ai_ollama_model?.trim()) {
        copy.model = legacy.ai_ollama_model.trim();
      }
      return copy;
    },
  );

  return {
    ai_providers: providers,
    ai_default_provider_id: legacy.ai_default_backend ?? "auto",
  };
}
