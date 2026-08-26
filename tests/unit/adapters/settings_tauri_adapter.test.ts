import { beforeEach, describe, expect, it, vi } from "vitest";
import { create_settings_tauri_adapter } from "$lib/features/settings/adapters/settings_tauri_adapter";

const { tauri_invoke_mock } = vi.hoisted(() => ({
  tauri_invoke_mock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/shared/adapters/tauri_invoke", () => ({
  tauri_invoke: tauri_invoke_mock,
}));

describe("settings_tauri_adapter.set_setting", () => {
  beforeEach(() => {
    tauri_invoke_mock.mockClear();
    tauri_invoke_mock.mockResolvedValue(undefined);
  });

  it("coerces undefined to null so the payload keeps the value key", async () => {
    const adapter = create_settings_tauri_adapter();

    await adapter.set_setting("ai_rag_context_token_budget", undefined);

    expect(tauri_invoke_mock).toHaveBeenCalledWith("set_setting", {
      key: "ai_rag_context_token_budget",
      value: null,
    });
    const payload = tauri_invoke_mock.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(payload).toHaveProperty("value");
    expect(payload.value).not.toBeUndefined();
  });

  it("sends null unchanged", async () => {
    const adapter = create_settings_tauri_adapter();

    await adapter.set_setting("ai_rag_context_token_budget", null);

    expect(tauri_invoke_mock).toHaveBeenCalledWith("set_setting", {
      key: "ai_rag_context_token_budget",
      value: null,
    });
  });

  it.each([
    ["false", false],
    ["zero", 0],
    ["empty string", ""],
  ])("sends %s unchanged", async (_label, value) => {
    const adapter = create_settings_tauri_adapter();

    await adapter.set_setting("autosave_enabled", value);

    expect(tauri_invoke_mock).toHaveBeenCalledWith("set_setting", {
      key: "autosave_enabled",
      value,
    });
  });
});

describe("settings_tauri_adapter.get_setting", () => {
  beforeEach(() => {
    tauri_invoke_mock.mockClear();
  });

  it("normalises a stored null back to null", async () => {
    tauri_invoke_mock.mockResolvedValue(null);
    const adapter = create_settings_tauri_adapter();

    const value = await adapter.get_setting("ai_rag_context_token_budget");

    expect(value).toBeNull();
  });
});
