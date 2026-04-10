import { describe, expect, it } from "vitest";
import { flushSync } from "svelte";
import { UIStore } from "$lib/app";
import { SttStore } from "$lib/features/stt";
import { create_stt_settings_sync_reactor } from "$lib/reactors/stt_settings_sync.reactor.svelte";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";

describe("stt_settings_sync.reactor", () => {
  function setup() {
    const ui_store = new UIStore();
    const stt_store = new SttStore();
    const unmount = create_stt_settings_sync_reactor(ui_store, stt_store);
    return { ui_store, stt_store, unmount };
  }

  it("returns a cleanup function", () => {
    const { unmount } = setup();
    expect(typeof unmount).toBe("function");
    unmount();
  });

  it("syncs stt_enabled from editor_settings to stt_store.config", () => {
    const { ui_store, stt_store, unmount } = setup();

    ui_store.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      stt_enabled: true,
    });
    flushSync();

    expect(stt_store.config.enabled).toBe(true);
    unmount();
  });

  it("syncs model_id from editor_settings to stt_store.config", () => {
    const { ui_store, stt_store, unmount } = setup();

    ui_store.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      stt_enabled: true,
      stt_model_id: "whisper-large",
    });
    flushSync();

    expect(stt_store.config.model_id).toBe("whisper-large");
    unmount();
  });

  it("syncs language and vad_threshold", () => {
    const { ui_store, stt_store, unmount } = setup();

    ui_store.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      stt_language: "en",
      stt_vad_threshold: 0.5,
    });
    flushSync();

    expect(stt_store.config.language).toBe("en");
    expect(stt_store.config.vad_threshold).toBe(0.5);
    unmount();
  });

  it("syncs ai_cleanup fields", () => {
    const { ui_store, stt_store, unmount } = setup();

    ui_store.set_editor_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      stt_ai_cleanup_enabled: true,
      stt_ai_cleanup_prompt: "Custom prompt",
    });
    flushSync();

    expect(stt_store.config.ai_cleanup_enabled).toBe(true);
    expect(stt_store.config.ai_cleanup_prompt).toBe("Custom prompt");
    unmount();
  });

  it("does not sync when editor_settings are not loaded", () => {
    const ui_store = new UIStore();
    const stt_store = new SttStore();

    expect(ui_store.editor_settings_loaded).toBe(false);

    const unmount = create_stt_settings_sync_reactor(ui_store, stt_store);
    flushSync();

    expect(stt_store.config.enabled).toBe(false);
    unmount();
  });
});
