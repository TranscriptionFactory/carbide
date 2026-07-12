import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

export type AiUserError = { message: string; detail: string };

const CLI_NOT_FOUND = /failed to spawn|cli not found/i;
const UNREACHABLE =
  /could not reach ai server|connection refused|connect(?:ion)? error|timed? ?out/i;

export function humanize_ai_error(
  raw: string,
  provider: AiProviderConfig,
): AiUserError {
  if (CLI_NOT_FOUND.test(raw)) {
    return {
      message: `${provider.name} CLI not found — install it or choose another provider in Settings.`,
      detail: raw,
    };
  }
  if (UNREACHABLE.test(raw)) {
    const base_url =
      provider.transport.kind === "api" ? provider.transport.base_url : null;
    return {
      message: base_url
        ? `Could not reach ${provider.name} at ${base_url} — make sure the server is running, or check the base URL in Settings.`
        : `Could not reach ${provider.name} — check your connection and try again.`,
      detail: raw,
    };
  }
  return {
    message: `${provider.name} request failed — see logs for details.`,
    detail: raw,
  };
}
