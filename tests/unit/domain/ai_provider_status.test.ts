import { describe, expect, it } from "vitest";
import {
  describe_default_provider,
  type AiProviderProbeState,
} from "$lib/features/ai/domain/ai_provider_status";
import type { AiCliProbe } from "$lib/features/ai/domain/ai_types";
import { BUILTIN_PROVIDER_PRESETS } from "$lib/shared/types/ai_provider_config";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

function done(
  status: AiCliProbe["status"],
  version: string | null = null,
): AiProviderProbeState {
  return {
    state: "done",
    probe: { status, resolved_path: null, version, error: null },
  };
}

const api_provider: AiProviderConfig = {
  id: "lmstudio-local",
  name: "LM Studio",
  transport: { kind: "api", base_url: "http://localhost:1234/v1" },
};

describe("describe_default_provider", () => {
  it("announces a present explicit provider with its version", () => {
    const probes = new Map([["claude", done("present", "1.2.3")]]);
    expect(
      describe_default_provider("claude", BUILTIN_PROVIDER_PRESETS, probes),
    ).toBe("Claude Code 1.2.3 is ready to use.");
  });

  it("announces a present provider without version plainly", () => {
    const probes = new Map([["claude", done("present")]]);
    expect(
      describe_default_provider("claude", BUILTIN_PROVIDER_PRESETS, probes),
    ).toBe("Claude Code is ready to use.");
  });

  it("says a missing provider can still be selected", () => {
    const probes = new Map([["codex", done("missing")]]);
    expect(
      describe_default_provider("codex", BUILTIN_PROVIDER_PRESETS, probes),
    ).toBe(
      "Codex is not installed yet. You can still select it and install later.",
    );
  });

  it("never says not-installed for an unknown probe", () => {
    const probes = new Map([["codex", done("unknown")]]);
    const sentence = describe_default_provider(
      "codex",
      BUILTIN_PROVIDER_PRESETS,
      probes,
    );
    expect(sentence).not.toContain("not installed");
    expect(sentence).toContain("tried when you send");
  });

  it("shows a checking state while probes are pending", () => {
    const probes = new Map<string, AiProviderProbeState>([
      ["claude", { state: "probing" }],
    ]);
    expect(
      describe_default_provider("claude", BUILTIN_PROVIDER_PRESETS, probes),
    ).toBe("Checking for Claude Code…");
  });

  it("auto announces the first present provider", () => {
    const probes = new Map<string, AiProviderProbeState>(
      BUILTIN_PROVIDER_PRESETS.map((p) => [p.id, done("missing")]),
    );
    probes.set("codex", done("present", "0.4.0"));
    expect(
      describe_default_provider("auto", BUILTIN_PROVIDER_PRESETS, probes),
    ).toBe("Auto will use Codex 0.4.0.");
  });

  it("auto falls back to trying the first unknown provider", () => {
    const cli_presets = BUILTIN_PROVIDER_PRESETS.filter(
      (p) => p.transport.kind === "cli",
    );
    const probes = new Map<string, AiProviderProbeState>(
      cli_presets.map((p) => [p.id, done("missing")]),
    );
    probes.set("codex", done("unknown"));
    expect(describe_default_provider("auto", cli_presets, probes)).toBe(
      "Auto will try Codex.",
    );
  });

  it("auto reports when nothing is installed", () => {
    const cli_presets = BUILTIN_PROVIDER_PRESETS.filter(
      (p) => p.transport.kind === "cli",
    );
    const probes = new Map<string, AiProviderProbeState>(
      cli_presets.map((p) => [p.id, done("missing")]),
    );
    expect(describe_default_provider("auto", cli_presets, probes)).toBe(
      "No providers are installed yet. Auto will keep checking.",
    );
  });

  it("treats api transports as present without probes", () => {
    expect(
      describe_default_provider("lmstudio-local", [api_provider], new Map()),
    ).toBe("LM Studio is ready to use.");
  });

  it("handles empty provider lists", () => {
    expect(describe_default_provider("auto", [], new Map())).toBe(
      "No AI providers configured.",
    );
  });
});
