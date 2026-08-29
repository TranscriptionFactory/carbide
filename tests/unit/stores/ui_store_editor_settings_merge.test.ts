// @vitest-environment jsdom
// jsdom + flushSync is what actually runs an $effect body under vitest; in the
// node environment the effects never run and every "did not re-run" assertion
// below would pass vacuously. The first test asserts a positive re-run count so
// a dropped pragma fails loudly instead of going green for the wrong reason.
import { describe, expect, it } from "vitest";
import { flushSync } from "svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import { create_effect_probe } from "../helpers/effect_probe.svelte";

function make_store() {
  const ui = new UIStore();
  ui.set_editor_settings({ ...DEFAULT_EDITOR_SETTINGS });
  return ui;
}

describe("UIStore.set_editor_settings field-wise merge", () => {
  it("re-runs a reader when its own field changes", () => {
    const ui = make_store();
    const probe = create_effect_probe(() => ui.editor_settings.lint_enabled);
    flushSync();
    const baseline = probe.runs();
    expect(baseline).toBeGreaterThan(0);

    ui.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      lint_enabled: !DEFAULT_EDITOR_SETTINGS.lint_enabled,
    });
    flushSync();

    expect(probe.runs()).toBe(baseline + 1);
    probe.stop();
  });

  it("leaves unrelated readers asleep when one field changes", () => {
    const ui = make_store();
    const lint = create_effect_probe(() => ui.editor_settings.lint_enabled);
    const mode = create_effect_probe(() => ui.editor_settings.file_tree_mode);
    flushSync();
    const lint_baseline = lint.runs();
    const mode_baseline = mode.runs();

    ui.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      file_tree_mode: "recents",
    });
    flushSync();

    expect(mode.runs()).toBe(mode_baseline + 1);
    expect(lint.runs()).toBe(lint_baseline);
    lint.stop();
    mode.stop();
  });

  it("treats a structurally equal nested value as unchanged", () => {
    const ui = make_store();
    const probe = create_effect_probe(() => ui.editor_settings.ignored_folders);
    flushSync();
    const baseline = probe.runs();

    ui.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      ignored_folders: [...DEFAULT_EDITOR_SETTINGS.ignored_folders],
      file_tree_mode: "bases",
    });
    flushSync();

    expect(probe.runs()).toBe(baseline);
    probe.stop();
  });

  it("still exposes the merged settings value", () => {
    const ui = make_store();

    ui.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      file_tree_mode: "recents",
      lint_enabled: !DEFAULT_EDITOR_SETTINGS.lint_enabled,
    });

    expect(ui.editor_settings.file_tree_mode).toBe("recents");
    expect(ui.editor_settings.lint_enabled).toBe(
      !DEFAULT_EDITOR_SETTINGS.lint_enabled,
    );
    expect(ui.editor_settings_loaded).toBe(true);
  });

  it("drops a key the incoming settings no longer carry", () => {
    const ui = make_store();
    ui.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      ai_rag_context_token_budget: 8000,
    });
    expect(ui.editor_settings.ai_rag_context_token_budget).toBe(8000);

    ui.set_editor_settings({ ...DEFAULT_EDITOR_SETTINGS });

    expect(ui.editor_settings.ai_rag_context_token_budget).toBeUndefined();
    expect("ai_rag_context_token_budget" in ui.editor_settings).toBe(false);
  });
});
