import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_SETTINGS,
  GLOBAL_ONLY_SETTING_KEYS,
  omit_global_only_keys,
} from "$lib/shared/types/editor_settings";
import { SETTINGS_REGISTRY } from "$lib/features/settings/domain/settings_catalog";

const KEY = "ambient_notices_enabled";

describe("ambient notices opt-in", () => {
  // G1 — I6: opt-in means OFF until asked for.
  it("defaults to off", () => {
    expect(DEFAULT_EDITOR_SETTINGS[KEY]).toBe(false);
  });

  // G3 — the behavioural assertion for "vault-scoped". A grep over
  // editor_settings.ts cannot express "absent from a list inside that same
  // file"; this can. Vault-scoped is the DEFAULT and global is the opt-out, so
  // the key is vault-scoped precisely by surviving this filter.
  it("is vault-scoped: survives the global-only filter", () => {
    const filtered = omit_global_only_keys({ [KEY]: true });

    expect(filtered).toHaveProperty(KEY, true);
  });

  it("is not listed as a global-only key", () => {
    expect(GLOBAL_ONLY_SETTING_KEYS).not.toContain(KEY);
  });

  // Guards the ruling itself: every other ai_*/assistant_* key is app-global,
  // so this is the first vault-scoped one. If someone "fixes" the asymmetry by
  // adding it to the list, this fails loudly.
  it("is the exception among assistant settings, which are global", () => {
    expect(GLOBAL_ONLY_SETTING_KEYS).toContain(
      "assistant_session_retention_days",
    );
    expect(GLOBAL_ONLY_SETTING_KEYS).toContain("ai_enabled");
    expect(GLOBAL_ONLY_SETTING_KEYS).not.toContain(KEY);
  });

  // G4 — C1's retention setting is missing from the registry and is therefore
  // invisible to settings search. Not propagating that omission.
  it("is discoverable through settings search", () => {
    const entry = SETTINGS_REGISTRY.find((setting) => setting.key === KEY);

    expect(entry).toBeDefined();
    expect(entry?.label).toBeTruthy();
    expect(entry?.description).toBeTruthy();
    expect(entry?.category).toBeTruthy();
    expect(entry?.keywords.length).toBeGreaterThan(0);
  });

  it("is searchable by the words a user would type", () => {
    const entry = SETTINGS_REGISTRY.find((setting) => setting.key === KEY);

    expect(entry?.keywords).toContain("ambient");
    expect(entry?.keywords).toContain("notices");
  });
});
