import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import {
  resolve_auto_ai_backend,
  type AiCliProbeStatus,
} from "$lib/features/ai";

export type ProviderResolutionInput = {
  providers: AiProviderConfig[];
  requested_id: string;
  detect_status: (config: AiProviderConfig) => Promise<AiCliProbeStatus>;
};

export type ProviderResolution =
  | { status: "resolved"; provider: AiProviderConfig; was_auto: boolean }
  | { status: "unavailable"; reason: string };

// I3: the single place that answers "which provider runs this?". `auto` must
// never select a provider a probe reports as missing — the pre-kernel callsites
// each had their own answer and one of them just took providers[0].
export async function resolve_assistant_provider(
  input: ProviderResolutionInput,
): Promise<ProviderResolution> {
  if (input.providers.length === 0) {
    return {
      status: "unavailable",
      reason: "No AI providers configured. Add one in Settings › AI.",
    };
  }

  if (input.requested_id !== "auto") {
    const requested = input.providers.find((p) => p.id === input.requested_id);
    if (requested) {
      return { status: "resolved", provider: requested, was_auto: false };
    }
  }

  const provider = await resolve_auto_ai_backend({
    providers: input.providers,
    detect_status: (config) => probe_or_assume_present(config, input),
  });

  if (!provider) {
    return {
      status: "unavailable",
      reason:
        "No configured AI provider is installed. Install one, or check its " +
        "command in Settings › AI.",
    };
  }

  return { status: "resolved", provider, was_auto: true };
}

// An api-transport provider has no CLI to find on PATH; reaching the endpoint is
// the run's job, so it stays a candidate instead of probing to `missing`.
function probe_or_assume_present(
  config: AiProviderConfig,
  input: ProviderResolutionInput,
): Promise<AiCliProbeStatus> {
  if (config.transport.kind === "api") {
    return Promise.resolve("present");
  }
  return input.detect_status(config);
}
