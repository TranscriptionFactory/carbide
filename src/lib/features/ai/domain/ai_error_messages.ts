import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

export type AiUserError = { message: string; detail: string };

const CLI_NOT_FOUND = /failed to spawn|cli not found/i;
const CLI_NOT_EXECUTABLE = /not executable/i;
const AUTH_FAILURE =
  /please run \/login|not logged in|invalid api key|api key not found|unauthorized/i;
const UNREACHABLE =
  /could not reach ai server|connection refused|connect(?:ion)? error|timed? ?out/i;

export function humanize_ai_error(
  raw: string,
  provider: AiProviderConfig,
): AiUserError {
  if (CLI_NOT_EXECUTABLE.test(raw)) {
    return {
      message: `${provider.name} CLI was found but is not executable — run chmod +x on it or reinstall.`,
      detail: raw,
    };
  }
  if (CLI_NOT_FOUND.test(raw)) {
    return {
      message: `${provider.name} CLI not found — install it or choose another provider in Settings.`,
      detail: raw,
    };
  }
  if (AUTH_FAILURE.test(raw)) {
    const command =
      provider.transport.kind === "cli" ? provider.transport.command : null;
    return {
      message: command
        ? `${provider.name} is not signed in — run \`${command}\` in a terminal to log in, then try again.`
        : `${provider.name} rejected the request — check your API key in Settings.`,
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
