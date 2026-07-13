import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AiCliProbeStatus } from "$lib/features/ai/domain/ai_types";

export function preferred_ai_backend_order(
  default_provider_id: string,
  providers: AiProviderConfig[],
): AiProviderConfig[] {
  if (default_provider_id === "auto") {
    return [...providers];
  }

  const match = providers.find((p) => p.id === default_provider_id);
  return match ? [match] : [...providers];
}

export async function resolve_auto_ai_backend(input: {
  providers: AiProviderConfig[];
  detect_status: (config: AiProviderConfig) => Promise<AiCliProbeStatus>;
}): Promise<AiProviderConfig | null> {
  let first_unknown: AiProviderConfig | null = null;

  for (const provider of input.providers) {
    let status: AiCliProbeStatus;
    try {
      status = await input.detect_status(provider);
    } catch {
      status = "unknown";
    }
    if (status === "present") {
      return provider;
    }
    if (status === "unknown" && first_unknown === null) {
      first_unknown = provider;
    }
  }

  return first_unknown;
}
