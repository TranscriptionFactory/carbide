import { describe, expect, it } from "vitest";
import { build_chat_query_input } from "$lib/features/assistant";
import {
  DEFAULT_EDITOR_SETTINGS,
  type EditorSettings,
} from "$lib/shared/types/editor_settings";
import {
  BUILTIN_PROVIDER_PRESETS,
  type AiProviderConfig,
} from "$lib/shared/types/ai_provider_config";

// The single derivation every question-asking surface shares. Its parity role
// is covered in assistant_chat_mcp_bridge.test.ts; these cases pin the clamps
// and the optional-field handling it does on the way.

const provider: AiProviderConfig = {
  id: "ollama",
  name: "Ollama",
  transport: { kind: "cli", command: "ollama", args: ["run", "{model}"] },
  model: "qwen3:8b",
};

function settings(overrides: Partial<EditorSettings> = {}): EditorSettings {
  return { ...DEFAULT_EDITOR_SETTINGS, ...overrides };
}

function build(overrides: Partial<EditorSettings> = {}) {
  return build_chat_query_input({
    question: "what is it?",
    provider_config: provider,
    settings: settings(overrides),
  });
}

describe("build_chat_query_input", () => {
  it("declares large windows only for the builtin providers that know them", () => {
    const windows = Object.fromEntries(
      BUILTIN_PROVIDER_PRESETS.map((preset) => [
        preset.id,
        preset.context_window_tokens,
      ]),
    );

    expect(windows).toMatchObject({
      claude: 200_000,
      codex: 200_000,
      opencode: 200_000,
      pi: 200_000,
      ollama: undefined,
    });
  });

  it("carries the configured retrieval limit and token budget through", () => {
    const input = build({
      ai_rag_retrieve_limit: 7,
      ai_rag_context_token_budget: 3000,
    });

    expect(input.retrieve_limit).toBe(7);
    expect(input.assembler_options).toEqual({
      token_budget: 3000,
      reserve_tokens: 750,
    });
  });

  it("clamps a retrieval limit outside the supported range", () => {
    expect(build({ ai_rag_retrieve_limit: 0 }).retrieve_limit).toBe(1);
    expect(build({ ai_rag_retrieve_limit: 999 }).retrieve_limit).toBe(50);
  });

  it("clamps a token budget outside the supported range", () => {
    expect(
      build({ ai_rag_context_token_budget: 10 }).assembler_options,
    ).toEqual({ token_budget: 1000, reserve_tokens: 250 });
    expect(
      build({ ai_rag_context_token_budget: 999999 }).assembler_options,
    ).toEqual({ token_budget: 128000, reserve_tokens: 32000 });
  });

  it("falls back to the shipped default when a setting is not a number", () => {
    const input = build({
      ai_rag_retrieve_limit: Number.NaN,
      ai_rag_context_token_budget: Number.NaN,
    });

    expect(input.retrieve_limit).toBe(
      DEFAULT_EDITOR_SETTINGS.ai_rag_retrieve_limit,
    );
    expect(input.assembler_options).toEqual({
      token_budget: 8000,
      reserve_tokens: 2000,
    });
  });

  it("lets the window fraction, not the ceiling, size a 200k provider window", () => {
    const input = build_chat_query_input({
      question: "what is it?",
      provider_config: { ...provider, context_window_tokens: 200_000 },
      settings: settings(),
    });

    expect(input.assembler_options).toEqual({
      token_budget: 60000,
      reserve_tokens: 15000,
    });
  });

  it("caps the context budget when the provider window is oversized", () => {
    const input = build_chat_query_input({
      question: "what is it?",
      provider_config: { ...provider, context_window_tokens: 1_000_000 },
      settings: settings(),
    });

    expect(input.assembler_options).toEqual({
      token_budget: 64000,
      reserve_tokens: 16000,
    });
  });

  it("applies the floor to small windows and the fallback to unknown windows", () => {
    const small = build_chat_query_input({
      question: "q",
      provider_config: { ...provider, context_window_tokens: 4000 },
      settings: settings(),
    });
    const unknown = build();

    expect(small.assembler_options).toEqual({
      token_budget: 8000,
      reserve_tokens: 2000,
    });
    expect(unknown.assembler_options).toEqual({
      token_budget: 8000,
      reserve_tokens: 2000,
    });
  });

  it("lets an explicit budget override the provider window", () => {
    const input = build_chat_query_input({
      question: "q",
      provider_config: { ...provider, context_window_tokens: 200_000 },
      settings: settings({ ai_rag_context_token_budget: 12000 }),
    });

    expect(input.assembler_options).toEqual({
      token_budget: 12000,
      reserve_tokens: 3000,
    });
  });

  it("carries the configured history budget through", () => {
    expect(
      build({ ai_rag_history_token_budget: 3000 }).history_token_budget,
    ).toBe(3000);
  });

  it("rounds a fractional limit rather than passing it on", () => {
    expect(build({ ai_rag_retrieve_limit: 7.6 }).retrieve_limit).toBe(8);
  });

  it("omits optional fields the caller did not supply", () => {
    const input = build();

    expect("scope" in input).toBe(false);
    expect("history" in input).toBe(false);
    expect("image_parts" in input).toBe(false);
    expect("on_run_started" in input).toBe(false);
  });

  it("passes the optional fields through when the caller supplies them", () => {
    const on_run_started = () => {};
    const input = build_chat_query_input({
      question: "what is it?",
      provider_config: provider,
      settings: settings(),
      scope: { folders: ["notes"] },
      history: [{ id: "1", role: "user", content: "hi", citations: [] }],
      image_parts: [],
      on_run_started,
    });

    expect(input.scope).toEqual({ folders: ["notes"] });
    expect(input.history).toEqual([
      { id: "1", role: "user", content: "hi", citations: [] },
    ]);
    expect(input.image_parts).toEqual([]);
    expect(input.on_run_started).toBe(on_run_started);
  });

  it("passes the attachment through verbatim (pin 5)", () => {
    const attachment = {
      path: "artifacts/report.html",
      title: "report",
      content: "<h1>Q3</h1>",
    };

    const input = build_chat_query_input({
      question: "q",
      provider_config: provider,
      settings: settings(),
      attachment,
    });

    expect(input.attachment).toBe(attachment);
  });

  it("passes the session id through so the run can be opened from the popover", () => {
    const input = build_chat_query_input({
      question: "q",
      provider_config: provider,
      settings: settings(),
      session_id: "session-9",
    });

    expect(input.session_id).toBe("session-9");
  });

  it("omits the session id for a caller with no session", () => {
    expect(build().session_id).toBeUndefined();
  });
});
