import { describe, it, expect } from "vitest";
import {
  apply_global_only_overrides,
  DEFAULT_EDITOR_SETTINGS,
} from "$lib/shared/types/editor_settings";

describe("apply_global_only_overrides", () => {
  it("does not override array settings with null", async () => {
    const base = { ...DEFAULT_EDITOR_SETTINGS };
    const get_setting = async () => null;

    const result = await apply_global_only_overrides(base, get_setting);

    expect(result.ai_providers).toEqual(DEFAULT_EDITOR_SETTINGS.ai_providers);
    expect(Array.isArray(result.ai_providers)).toBe(true);
  });

  it("does not override array settings with a plain object", async () => {
    const base = { ...DEFAULT_EDITOR_SETTINGS };
    const get_setting = async () => ({ not: "an array" });

    const result = await apply_global_only_overrides(base, get_setting);

    expect(result.ai_providers).toEqual(DEFAULT_EDITOR_SETTINGS.ai_providers);
  });

  it("applies valid overrides of matching type", async () => {
    const base = { ...DEFAULT_EDITOR_SETTINGS };
    const get_setting = async (key: string) => {
      if (key === "ai_enabled") return false;
      return undefined;
    };

    const result = await apply_global_only_overrides(base, get_setting);

    expect(result.ai_enabled).toBe(false);
  });

  it("restores a stored value for an optional key that has no default", async () => {
    const base = { ...DEFAULT_EDITOR_SETTINGS };
    const get_setting = (key: string) =>
      Promise.resolve(key === "ai_rag_context_token_budget" ? 8000 : null);

    const result = await apply_global_only_overrides(base, get_setting);

    expect(result.ai_rag_context_token_budget).toBe(8000);
  });

  it("leaves an optional key unset when nothing is stored", async () => {
    const base = { ...DEFAULT_EDITOR_SETTINGS };
    const get_setting = () => Promise.resolve(null);

    const result = await apply_global_only_overrides(base, get_setting);

    expect(result.ai_rag_context_token_budget).toBeUndefined();
  });

  it("rejects a stored value that does not match the declared type", async () => {
    const base = { ...DEFAULT_EDITOR_SETTINGS };
    const get_setting = (key: string) =>
      Promise.resolve(key === "ai_rag_context_token_budget" ? "8000" : null);

    const result = await apply_global_only_overrides(base, get_setting);

    expect(result.ai_rag_context_token_budget).toBeUndefined();
  });

  it("rejects a stored null for an optional key", async () => {
    const base = { ...DEFAULT_EDITOR_SETTINGS };
    const get_setting = () => Promise.resolve(null);

    const result = await apply_global_only_overrides(base, get_setting);

    expect(result.ai_rag_context_token_budget).toBeUndefined();
  });

  // An absent base value alone must not admit an override: without a declared
  // type there is nothing to validate against, so the key stays unset.
  it("ignores an absent base value that has no declared type", async () => {
    const base = { ...DEFAULT_EDITOR_SETTINGS } as Record<string, unknown>;
    delete base.ai_enabled;
    const get_setting = (key: string) =>
      Promise.resolve(key === "ai_enabled" ? true : null);

    const result = await apply_global_only_overrides(
      base as typeof DEFAULT_EDITOR_SETTINGS,
      get_setting,
    );

    expect(result.ai_enabled).toBeUndefined();
  });
});
