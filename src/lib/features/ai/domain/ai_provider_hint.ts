import type { AiProviderHint } from "$lib/features/plugin";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

export function derive_provider_hint(
  provider: AiProviderConfig,
): AiProviderHint {
  const model = provider.model ?? null;

  if (provider.transport.kind === "cli") {
    const cmd = provider.transport.command;
    if (cmd === "claude") {
      return {
        provider: "anthropic",
        model,
        api_key_env: "ANTHROPIC_API_KEY",
        base_url: null,
      };
    }
    if (cmd === "ollama") {
      return { provider: "ollama", model, api_key_env: null, base_url: null };
    }
    return { provider: "unknown", model, api_key_env: null, base_url: null };
  }

  const { base_url, api_key_env } = provider.transport;
  const combined = `${base_url} ${api_key_env ?? ""}`.toLowerCase();

  if (combined.includes("anthropic")) {
    return {
      provider: "anthropic",
      model,
      api_key_env: api_key_env ?? null,
      base_url: null,
    };
  }

  return {
    provider: "openai",
    model,
    api_key_env: api_key_env ?? null,
    base_url: base_url || null,
  };
}
