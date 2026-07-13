import type {
  AiCliProbe,
  AiCliProbeStatus,
  AiProviderConfig,
} from "$lib/features/ai/domain/ai_types";

export type AiProviderProbeState =
  | { state: "probing" }
  | { state: "done"; probe: AiCliProbe };

type EffectiveStatus = AiCliProbeStatus | "probing";

function status_of(
  provider: AiProviderConfig,
  probes: ReadonlyMap<string, AiProviderProbeState>,
): EffectiveStatus {
  if (provider.transport.kind !== "cli") return "present";
  const entry = probes.get(provider.id);
  if (!entry || entry.state === "probing") return "probing";
  return entry.probe.status;
}

function display_name(
  provider: AiProviderConfig,
  probes: ReadonlyMap<string, AiProviderProbeState>,
): string {
  const entry = probes.get(provider.id);
  const version = entry?.state === "done" ? entry.probe.version : null;
  return version ? `${provider.name} ${version}` : provider.name;
}

export function describe_default_provider(
  default_provider_id: string,
  providers: AiProviderConfig[],
  probes: ReadonlyMap<string, AiProviderProbeState>,
): string {
  if (providers.length === 0) return "No AI providers configured.";

  if (default_provider_id === "auto") {
    if (providers.some((p) => status_of(p, probes) === "probing")) {
      return "Checking providers…";
    }
    const present = providers.find((p) => status_of(p, probes) === "present");
    if (present) return `Auto will use ${display_name(present, probes)}.`;
    const unknown = providers.find((p) => status_of(p, probes) === "unknown");
    if (unknown) return `Auto will try ${unknown.name}.`;
    return "No providers are installed yet. Auto will keep checking.";
  }

  const provider = providers.find((p) => p.id === default_provider_id);
  if (!provider) return "";

  switch (status_of(provider, probes)) {
    case "probing":
      return `Checking for ${provider.name}…`;
    case "present":
      return `${display_name(provider, probes)} is ready to use.`;
    case "missing":
      return `${provider.name} is not installed yet. You can still select it and install later.`;
    case "unknown":
      return `${provider.name} could not be verified — it will be tried when you send.`;
  }
}
