import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AiCliProbeStatus } from "$lib/features/ai";

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
export function resolve_assistant_provider(
  _input: ProviderResolutionInput,
): Promise<ProviderResolution> {
  throw new Error("resolve_assistant_provider: not implemented (AU-003)");
}
