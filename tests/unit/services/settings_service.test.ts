import { describe, expect, it, vi } from "vitest";
import {
  SettingsService,
  WELCOME_STATE_VERSION,
} from "$lib/features/settings/application/settings_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { as_vault_id } from "$lib/shared/types/ids";
import {
  DEFAULT_EDITOR_SETTINGS,
  GLOBAL_ONLY_SETTING_KEYS,
} from "$lib/shared/types/editor_settings";
import { create_test_vault } from "../helpers/test_fixtures";

const VAULT_ID = as_vault_id("vault-a");

// GLOBAL_ONLY_SETTING_KEYS entries whose EditorSettings default is intentionally
// absent. Each one must survive the round trip as an explicit null, which the
// settings adapter is responsible for producing.
const NULLABLE_GLOBAL_ONLY_KEYS = new Set<string>([
  "ai_rag_context_token_budget",
]);

function make_service(overrides: {
  vault_get?: unknown;
  global_get?: (key: string) => unknown;
  set_setting_impl?: (key: string, value: unknown) => Promise<void>;
  now_ms?: () => number;
}) {
  const vault_settings_port = {
    get_vault_setting: vi.fn().mockResolvedValue(overrides.vault_get ?? null),
    set_vault_setting: vi.fn().mockResolvedValue(undefined),
  };
  const global_get = overrides.global_get ?? (() => null);
  const settings_port = {
    get_setting: vi
      .fn()
      .mockImplementation((key: string) => Promise.resolve(global_get(key))),
    set_setting: vi
      .fn()
      .mockImplementation((key: string, value: unknown) =>
        overrides.set_setting_impl
          ? overrides.set_setting_impl(key, value)
          : Promise.resolve(undefined),
      ),
  };
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault({ id: VAULT_ID }));
  const op_store = new OpStore();
  const service = new SettingsService(
    vault_settings_port as never,
    settings_port as never,
    vault_store,
    op_store,
    overrides.now_ms ?? (() => 1),
  );
  return { service, vault_settings_port, settings_port };
}

describe("SettingsService", () => {
  it("loads global-only settings from global port, not vault", async () => {
    const { service } = make_service({
      vault_get: { max_open_tabs: 8, ignored_folders: ["node_modules"] },
      global_get: (key) => {
        if (key === "show_vault_dashboard_on_open") return false;
        if (key === "autosave_enabled") return false;
        if (key === "autosave_delay_ms") return 3500;
        if (key === "git_autocommit_mode") return "on_save";
        if (key === "editor_selection_color") return "#112233";
        if (key === "editor_blockquote_border_width") return 4;
        if (key === "editor_link_underline_style") return "wavy";
        if (key === "ai_enabled") return false;
        if (key === "ai_default_provider_id") return "ollama";
        if (key === "terminal_font_size_px") return 15;
        if (key === "document_pdf_default_zoom") return "fit_width";
        return null;
      },
    });

    const result = await service.load_settings({
      ...DEFAULT_EDITOR_SETTINGS,
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.settings.show_vault_dashboard_on_open).toBe(false);
    expect(result.settings.autosave_enabled).toBe(false);
    expect(result.settings.autosave_delay_ms).toBe(3500);
    expect(result.settings.git_autocommit_mode).toBe("on_save");
    expect(result.settings.editor_selection_color).toBe("#112233");
    expect(result.settings.editor_blockquote_border_width).toBe(4);
    expect(result.settings.editor_link_underline_style).toBe("wavy");
    expect(result.settings.ai_enabled).toBe(false);
    expect(result.settings.ai_default_provider_id).toBe("ollama");
    expect(result.settings.terminal_font_size_px).toBe(15);
    expect(result.settings.document_pdf_default_zoom).toBe("fit_width");
    expect(result.settings.max_open_tabs).toBe(8);
    expect(result.settings.ignored_folders).toEqual(["node_modules"]);
  });

  it("saves global-only settings to global port only", async () => {
    const { service, vault_settings_port, settings_port } = make_service({});

    const settings = {
      ...DEFAULT_EDITOR_SETTINGS,
      show_vault_dashboard_on_open: false,
      autosave_enabled: false,
      autosave_delay_ms: 3500,
      git_autocommit_mode: "on_save" as const,
      editor_selection_color: "#112233",
      editor_blockquote_border_width: 4 as const,
      editor_link_underline_style: "wavy" as const,
      ai_enabled: false,
      ai_default_provider_id: "codex",
      ai_execution_timeout_seconds: 120,
    };

    const result = await service.save_settings(settings);

    expect(result.status).toBe("success");

    const saved_vault = vault_settings_port.set_vault_setting.mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(saved_vault).not.toHaveProperty("show_vault_dashboard_on_open");
    expect(saved_vault).not.toHaveProperty("autosave_enabled");
    expect(saved_vault).not.toHaveProperty("git_autocommit_mode");
    expect(saved_vault).not.toHaveProperty("editor_selection_color");
    expect(saved_vault).not.toHaveProperty("editor_blockquote_border_width");
    expect(saved_vault).not.toHaveProperty("editor_link_underline_style");
    expect(saved_vault).not.toHaveProperty("ai_enabled");
    expect(saved_vault).not.toHaveProperty("ai_default_provider_id");
    expect(saved_vault).not.toHaveProperty("ai_execution_timeout_seconds");
    expect(saved_vault).toHaveProperty("max_open_tabs");
    expect(saved_vault).toHaveProperty("ignored_folders", []);

    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "show_vault_dashboard_on_open",
      false,
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "autosave_enabled",
      false,
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "autosave_delay_ms",
      3500,
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "git_autocommit_mode",
      "on_save",
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "editor_selection_color",
      "#112233",
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "editor_blockquote_border_width",
      4,
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "editor_link_underline_style",
      "wavy",
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith("ai_enabled", false);
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "ai_default_provider_id",
      "codex",
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "ai_execution_timeout_seconds",
      120,
    );
  });

  it("sanitizes stale global-only keys from vault settings during load", async () => {
    const { service, vault_settings_port } = make_service({
      vault_get: {
        max_open_tabs: 7,
        autosave_enabled: true,
        show_vault_dashboard_on_open: true,
        git_autocommit_mode: "on_save",
        editor_selection_color: "#112233",
        ai_enabled: false,
        ai_default_provider_id: "codex",
      },
      global_get: () => false,
    });

    const result = await service.load_settings({
      ...DEFAULT_EDITOR_SETTINGS,
    });

    expect(result.status).toBe("success");

    const written_vault = vault_settings_port.set_vault_setting.mock
      .calls[0]?.[2] as Record<string, unknown>;
    expect(written_vault).not.toHaveProperty("show_vault_dashboard_on_open");
    expect(written_vault).not.toHaveProperty("autosave_enabled");
    expect(written_vault).not.toHaveProperty("git_autocommit_mode");
    expect(written_vault).not.toHaveProperty("editor_selection_color");
    expect(written_vault).not.toHaveProperty("ai_enabled");
    expect(written_vault).not.toHaveProperty("ai_default_provider_id");
    expect(written_vault).toHaveProperty("max_open_tabs", 7);
  });

  it("uses fallback defaults when no global value is stored", async () => {
    const { service } = make_service({
      vault_get: { max_open_tabs: 3 },
      global_get: () => null,
    });

    const result = await service.load_settings({
      ...DEFAULT_EDITOR_SETTINGS,
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("expected success");
    expect(result.settings.show_vault_dashboard_on_open).toBe(
      DEFAULT_EDITOR_SETTINGS.show_vault_dashboard_on_open,
    );
    expect(result.settings.autosave_enabled).toBe(
      DEFAULT_EDITOR_SETTINGS.autosave_enabled,
    );
    expect(result.settings.ignored_folders).toEqual([]);
  });

  it("skips vault-scoped write in browse mode", async () => {
    const vault_settings_port = {
      get_vault_setting: vi.fn().mockResolvedValue(null),
      set_vault_setting: vi.fn().mockResolvedValue(undefined),
    };
    const settings_port = {
      get_setting: vi.fn().mockResolvedValue(null),
      set_setting: vi.fn().mockResolvedValue(undefined),
    };
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault({ id: VAULT_ID, mode: "browse" }));
    const op_store = new OpStore();
    const service = new SettingsService(
      vault_settings_port as never,
      settings_port as never,
      vault_store,
      op_store,
      () => 1,
    );

    const result = await service.save_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      ignored_folders: ["node_modules"],
    });

    expect(result.status).toBe("success");
    expect(vault_settings_port.set_vault_setting).not.toHaveBeenCalled();
    expect(settings_port.set_setting).toHaveBeenCalled();
  });

  it("persists ignored folders as vault-scoped settings", async () => {
    const { service, vault_settings_port, settings_port } = make_service({});

    const result = await service.save_settings({
      ...DEFAULT_EDITOR_SETTINGS,
      ignored_folders: ["node_modules", "papers/raw"],
    });

    expect(result.status).toBe("success");
    expect(vault_settings_port.set_vault_setting).toHaveBeenCalledWith(
      VAULT_ID,
      "editor",
      expect.objectContaining({
        ignored_folders: ["node_modules", "papers/raw"],
      }),
    );
    expect(settings_port.set_setting).not.toHaveBeenCalledWith(
      "ignored_folders",
      expect.anything(),
    );
  });

  it("saves every global-only key when the optional token budget is unset", async () => {
    const { service, settings_port } = make_service({});

    const result = await service.save_settings({ ...DEFAULT_EDITOR_SETTINGS });

    expect(result.status).toBe("success");
    expect(settings_port.set_setting).toHaveBeenCalledTimes(
      GLOBAL_ONLY_SETTING_KEYS.length,
    );
    // The service forwards the unset value as-is; the adapter is what turns it
    // into an explicit null on the wire.
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "ai_rag_context_token_budget",
      undefined,
    );
  });

  it("attempts every global-only key even when one write rejects", async () => {
    const { service, settings_port } = make_service({
      set_setting_impl: (key) =>
        key === "ai_rag_context_token_budget"
          ? Promise.reject(new Error("missing required key value"))
          : Promise.resolve(undefined),
    });

    const result = await service.save_settings({ ...DEFAULT_EDITOR_SETTINGS });

    expect(result.status).toBe("failed");
    expect(settings_port.set_setting).toHaveBeenCalledTimes(
      GLOBAL_ONLY_SETTING_KEYS.length,
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "mcp_enabled",
      DEFAULT_EDITOR_SETTINGS.mcp_enabled,
    );
    expect(settings_port.set_setting).toHaveBeenCalledWith(
      "close_to_tray",
      DEFAULT_EDITOR_SETTINGS.close_to_tray,
    );
  });

  it("names every key that failed to persist in the save error", async () => {
    const failing = new Set(["mcp_enabled", "close_to_tray"]);
    const { service } = make_service({
      set_setting_impl: (key) =>
        failing.has(key)
          ? Promise.reject(new Error("write failed"))
          : Promise.resolve(undefined),
    });

    const result = await service.save_settings({ ...DEFAULT_EDITOR_SETTINGS });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") throw new Error("expected failure");
    expect(result.error).toContain("mcp_enabled");
    expect(result.error).toContain("close_to_tray");
    expect(result.error).not.toContain("autosave_enabled");
  });

  it("keeps every global-only key backed by a default unless allow-listed", () => {
    const missing = GLOBAL_ONLY_SETTING_KEYS.filter(
      (key) =>
        (DEFAULT_EDITOR_SETTINGS as Record<string, unknown>)[key] ===
          undefined && !NULLABLE_GLOBAL_ONLY_KEYS.has(key),
    );

    expect(missing).toEqual([]);
  });

  it("keeps the token budget on automatic across a save and reload", async () => {
    const stored = new Map<string, unknown>();
    const { service } = make_service({
      // Mirrors the adapter contract: undefined travels as an explicit null.
      set_setting_impl: (key, value) => {
        stored.set(key, value ?? null);
        return Promise.resolve(undefined);
      },
      global_get: (key) => (stored.has(key) ? stored.get(key) : null),
    });

    const saved = await service.save_settings({ ...DEFAULT_EDITOR_SETTINGS });
    expect(saved.status).toBe("success");
    expect(stored.get("ai_rag_context_token_budget")).toBeNull();

    const loaded = await service.load_settings({ ...DEFAULT_EDITOR_SETTINGS });

    expect(loaded.status).toBe("success");
    if (loaded.status !== "success") throw new Error("expected success");
    expect(loaded.settings.ai_rag_context_token_budget).toBeUndefined();
  });

  it("loads welcome state with defaults when missing", async () => {
    const { service } = make_service({ global_get: () => null });

    const state = await service.load_welcome_state();

    expect(state).toEqual({ seen_version: 0, dismissed_at_ms: null });
  });

  it("loads stored welcome state when available", async () => {
    const { service } = make_service({
      global_get: (key) =>
        key === "welcome_state_v1"
          ? { seen_version: 2, dismissed_at_ms: 42 }
          : null,
    });

    const state = await service.load_welcome_state();

    expect(state).toEqual({ seen_version: 2, dismissed_at_ms: 42 });
  });

  it("marks welcome as seen with version and timestamp", async () => {
    const timestamp = 9876;
    const { service, settings_port } = make_service({
      now_ms: () => timestamp,
    });

    await service.mark_welcome_seen();

    expect(settings_port.set_setting).toHaveBeenCalledWith("welcome_state_v1", {
      seen_version: WELCOME_STATE_VERSION,
      dismissed_at_ms: timestamp,
    });
  });
});
