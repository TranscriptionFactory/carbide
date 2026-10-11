import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_SETTINGS,
  GLOBAL_ONLY_SETTING_KEYS,
  omit_global_only_keys,
} from "$lib/shared/types/editor_settings";
import { SETTINGS_REGISTRY } from "$lib/features/settings/domain/settings_catalog";

const KEY = "editor_syntax_reveal";

describe("syntax reveal setting", () => {
  it("defaults to on", () => {
    expect(DEFAULT_EDITOR_SETTINGS[KEY]).toBe(true);
  });

  it("is global-only: stripped from vault-scoped settings", () => {
    expect(GLOBAL_ONLY_SETTING_KEYS).toContain(KEY);
    expect(omit_global_only_keys({ [KEY]: false })).not.toHaveProperty(KEY);
  });

  it("is discoverable through settings search", () => {
    const entry = SETTINGS_REGISTRY.find((setting) => setting.key === KEY);

    expect(entry).toBeDefined();
    expect(entry?.label).toBeTruthy();
    expect(entry?.description).toBeTruthy();
    expect(entry?.category).toBe("Editor");
    expect(entry?.keywords).toContain("syntax");
    expect(entry?.keywords).toContain("delimiter");
  });
});
