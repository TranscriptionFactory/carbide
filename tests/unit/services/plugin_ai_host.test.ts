import { describe, expect, it, vi } from "vitest";
import { create_plugin_ai_host, type PluginAiHostDeps } from "$lib/features/ai";
import { resolve_assistant_provider } from "$lib/features/assistant";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { MarkdownText, NotePath } from "$lib/shared/types/ids";

const missing_cli: AiProviderConfig = {
  id: "codex",
  name: "Codex",
  transport: { kind: "cli", command: "codex", args: ["exec"] },
};

const present_cli: AiProviderConfig = {
  id: "claude",
  name: "Claude Code",
  transport: { kind: "cli", command: "claude", args: ["-p"] },
};

// The real rule, wired the way create_app_context wires it, so these scenarios
// exercise the resolver rather than a stand-in that agrees with it by luck.
function real_resolver(providers: AiProviderConfig[]) {
  return async (requested_id: string) => {
    const resolution = await resolve_assistant_provider({
      providers,
      requested_id,
      detect_status: (config) =>
        Promise.resolve(config.id === "codex" ? "missing" : "present"),
    });
    return resolution.status === "resolved" ? resolution.provider : null;
  };
}

function make_host(overrides: Partial<PluginAiHostDeps> = {}) {
  const execute = vi.fn().mockResolvedValue({
    success: true,
    output: "answered",
    error: null,
  });
  const deps: PluginAiHostDeps = {
    ai_enabled: () => true,
    default_provider_id: () => "auto",
    execution_timeout_seconds: () => 60,
    resolve_provider: real_resolver([missing_cli, present_cli]),
    vault_path: () => "/vault",
    open_note: () => ({
      path: "notes/a.md" as NotePath,
      title: "A",
      markdown: "body" as MarkdownText,
    }),
    execute,
    ...overrides,
  };
  return { host: create_plugin_ai_host(deps), execute };
}

describe("plugin ai host", () => {
  describe("execute", () => {
    // I3: this path used to read providers[0] with no availability probe, so a
    // plugin got handed a provider whose CLI was not installed.
    it("skips an unavailable first provider under auto", async () => {
      const { host, execute } = make_host();

      const result = await host.execute({ prompt: "summarize" });

      expect(result.success).toBe(true);
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_config: expect.objectContaining({ id: "claude" }),
        }),
      );
    });

    it("reports no provider when every configured one is unavailable", async () => {
      const { host, execute } = make_host({
        resolve_provider: real_resolver([missing_cli]),
      });

      const result = await host.execute({ prompt: "summarize" });

      expect(result).toEqual({
        success: false,
        output: "",
        error: "No AI provider configured",
      });
      expect(execute).not.toHaveBeenCalled();
    });

    it("honours an explicit provider id without probing past it", async () => {
      const { host, execute } = make_host({
        default_provider_id: () => "codex",
      });

      await host.execute({ prompt: "summarize" });

      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_config: expect.objectContaining({ id: "codex" }),
        }),
      );
    });

    it("refuses when AI is disabled, before resolving anything", async () => {
      const resolve_provider = vi.fn();
      const { host } = make_host({
        ai_enabled: () => false,
        resolve_provider,
      });

      const result = await host.execute({ prompt: "summarize" });

      expect(result.error).toBe("AI is disabled in settings");
      expect(resolve_provider).not.toHaveBeenCalled();
    });

    it("refuses when there is no active vault", async () => {
      const { host, execute } = make_host({ vault_path: () => null });

      const result = await host.execute({ prompt: "summarize" });

      expect(result.error).toBe("No active vault");
      expect(execute).not.toHaveBeenCalled();
    });

    it("passes the open note as context and defaults the mode to ask", async () => {
      const { host, execute } = make_host();

      await host.execute({ prompt: "summarize" });

      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "ask",
          timeout_seconds: 60,
          context: expect.objectContaining({
            note_path: "notes/a.md",
            note_title: "A",
            target: "full_note",
          }),
        }),
      );
    });

    it("falls back to empty note context when nothing is open", async () => {
      const { host, execute } = make_host({ open_note: () => null });

      await host.execute({ prompt: "summarize", mode: "edit" });

      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "edit",
          context: expect.objectContaining({
            note_path: "",
            note_title: "",
            note_markdown: "",
          }),
        }),
      );
    });
  });

  describe("get_provider_hint", () => {
    it("describes the provider auto actually resolved, not providers[0]", async () => {
      const { host } = make_host();

      await expect(host.get_provider_hint()).resolves.toEqual({
        provider: "anthropic",
        model: null,
        api_key_env: "ANTHROPIC_API_KEY",
        base_url: null,
      });
    });

    it("reports unknown when nothing is available", async () => {
      const { host } = make_host({
        resolve_provider: real_resolver([missing_cli]),
      });

      await expect(host.get_provider_hint()).resolves.toEqual({
        provider: "unknown",
        model: null,
        api_key_env: null,
        base_url: null,
      });
    });

    it("reports unknown when AI is disabled", async () => {
      const { host } = make_host({ ai_enabled: () => false });

      await expect(host.get_provider_hint()).resolves.toMatchObject({
        provider: "unknown",
      });
    });
  });
});
