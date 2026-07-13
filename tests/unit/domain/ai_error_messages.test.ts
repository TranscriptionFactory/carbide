import { describe, expect, it } from "vitest";
import { humanize_ai_error } from "$lib/features/ai/domain/ai_error_messages";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

const cli_provider: AiProviderConfig = {
  id: "claude",
  name: "Claude Code",
  transport: { kind: "cli", command: "claude", args: [] },
};

const api_provider: AiProviderConfig = {
  id: "lmstudio",
  name: "LM Studio",
  transport: { kind: "api", base_url: "http://localhost:1234/v1" },
};

describe("humanize_ai_error", () => {
  it("maps spawn failures to a CLI-not-found message", () => {
    const result = humanize_ai_error(
      "Failed to spawn claude: No such file or directory (os error 2)",
      cli_provider,
    );
    expect(result.message).toBe(
      "Claude Code CLI not found — install it or choose another provider in Settings.",
    );
    expect(result.detail).toContain("Failed to spawn claude");
  });

  it("maps backend CLI-not-found errors the same way", () => {
    const result = humanize_ai_error("Claude Code CLI not found", cli_provider);
    expect(result.message).toContain("CLI not found — install it");
  });

  it("maps not-executable errors to a chmod hint", () => {
    const result = humanize_ai_error(
      "Claude Code: /home/u/bin/claude found but not executable",
      cli_provider,
    );
    expect(result.message).toBe(
      "Claude Code CLI was found but is not executable — run chmod +x on it or reinstall.",
    );
    expect(result.detail).toContain("not executable");
  });

  it("maps CLI auth failures to a terminal login hint", () => {
    const result = humanize_ai_error(
      "Invalid API key · Please run /login",
      cli_provider,
    );
    expect(result.message).toBe(
      "Claude Code is not signed in — run `claude` in a terminal to log in, then try again.",
    );
  });

  it("maps api auth failures to a settings hint", () => {
    const result = humanize_ai_error(
      "AI server returned 401 Unauthorized",
      api_provider,
    );
    expect(result.message).toBe(
      "LM Studio rejected the request — check your API key in Settings.",
    );
  });

  it("maps connection refused to an unreachable message naming the base URL", () => {
    const result = humanize_ai_error(
      "Could not reach AI server: error sending request: Connection refused (os error 111)",
      api_provider,
    );
    expect(result.message).toBe(
      "Could not reach LM Studio at http://localhost:1234/v1 — make sure the server is running, or check the base URL in Settings.",
    );
    expect(result.detail).toContain("Connection refused");
  });

  it("maps timeouts to an unreachable message", () => {
    const result = humanize_ai_error(
      "Stream error: operation timed out",
      api_provider,
    );
    expect(result.message).toContain("Could not reach LM Studio at");
  });

  it("omits the base URL for non-api transports", () => {
    const result = humanize_ai_error("connection refused", cli_provider);
    expect(result.message).toBe(
      "Could not reach Claude Code — check your connection and try again.",
    );
  });

  it("falls back to a generic message and preserves the raw error", () => {
    const raw = "AI server returned 500: internal error";
    const result = humanize_ai_error(raw, api_provider);
    expect(result.message).toBe(
      "LM Studio request failed — see logs for details.",
    );
    expect(result.detail).toBe(raw);
  });
});
