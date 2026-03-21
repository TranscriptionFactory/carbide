import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { register_theme_actions } from "$lib/features/theme";
import { BUILTIN_NORDIC_DARK, type Theme } from "$lib/shared/types/theme";

function create_theme(
  id: string,
  name: string,
  overrides: Partial<Theme> = {},
): Theme {
  return {
    ...BUILTIN_NORDIC_DARK,
    id,
    name,
    is_builtin: false,
    token_overrides: {},
    ...overrides,
  };
}

function create_harness() {
  const registry = new ActionRegistry();
  const ui = new UIStore();
  const theme_service = {
    load_themes: vi.fn().mockResolvedValue({
      user_themes: [],
      active_theme_id: BUILTIN_NORDIC_DARK.id,
      color_scheme_preference: "dark",
      system_light_theme_id: "nordic-light",
      system_dark_theme_id: "nordic-dark",
    }),
    save_user_themes: vi.fn().mockResolvedValue(undefined),
    save_active_theme_id: vi.fn().mockResolvedValue(undefined),
    save_color_scheme_preference: vi.fn().mockResolvedValue(undefined),
    save_system_theme_ids: vi.fn().mockResolvedValue(undefined),
    duplicate_theme: vi.fn((name: string, base: Theme) => ({
      ...base,
      id: `${name.toLowerCase().replace(/\s+/g, "-")}-id`,
      name,
      is_builtin: false,
      token_overrides: { ...base.token_overrides },
    })),
  };

  register_theme_actions({
    registry,
    stores: { ui } as never,
    services: { theme: theme_service } as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    } as never,
  } as never);

  return { registry, ui, theme_service };
}

describe("register_theme_actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats rename as a draft and defers persistence", async () => {
    const { registry, ui, theme_service } = create_harness();
    const theme = create_theme("custom-a", "Custom A");
    ui.set_user_themes([theme]);
    ui.set_active_theme_id(theme.id);

    await registry.execute(ACTION_IDS.theme_rename, {
      id: theme.id,
      name: "Renamed Theme",
    });

    expect(ui.user_themes[0]?.name).toBe("Renamed Theme");
    expect(ui.theme_has_draft).toBe(true);
    expect(theme_service.save_user_themes).not.toHaveBeenCalled();
    expect(theme_service.save_active_theme_id).not.toHaveBeenCalled();
  });

  it("does not create a draft for no-op rename or missing delete", async () => {
    const { registry, ui, theme_service } = create_harness();
    const theme = create_theme("custom-a", "Custom A");
    ui.set_user_themes([theme]);
    ui.set_active_theme_id(theme.id);

    await registry.execute(ACTION_IDS.theme_rename, {
      id: theme.id,
      name: theme.name,
    });
    await registry.execute(ACTION_IDS.theme_delete, "missing-theme");

    expect(ui.theme_has_draft).toBe(false);
    expect(ui.user_themes).toEqual([theme]);
    expect(theme_service.save_user_themes).not.toHaveBeenCalled();
    expect(theme_service.save_active_theme_id).not.toHaveBeenCalled();
  });

  it("does not create a draft when switching to the active theme", async () => {
    const { registry, ui, theme_service } = create_harness();
    const theme = create_theme("custom-a", "Custom A");
    ui.set_user_themes([theme]);
    ui.set_active_theme_id(theme.id);

    await registry.execute(ACTION_IDS.theme_switch, theme.id);

    expect(ui.active_theme_id).toBe(theme.id);
    expect(ui.theme_has_draft).toBe(false);
    expect(theme_service.save_user_themes).not.toHaveBeenCalled();
    expect(theme_service.save_active_theme_id).not.toHaveBeenCalled();
  });

  it("reverts created themes on cancel", async () => {
    const { registry, ui, theme_service } = create_harness();
    const base = create_theme("custom-a", "Custom A");
    ui.set_user_themes([base]);
    ui.set_active_theme_id(base.id);

    await registry.execute(ACTION_IDS.theme_create, {
      name: "Created Theme",
      base,
    });

    expect(ui.user_themes).toHaveLength(2);
    expect(ui.active_theme_id).toBe("created-theme-id");
    expect(theme_service.save_user_themes).not.toHaveBeenCalled();

    await registry.execute(ACTION_IDS.theme_revert);

    expect(ui.user_themes).toEqual([base]);
    expect(ui.active_theme_id).toBe(base.id);
    expect(ui.theme_has_draft).toBe(false);
  });

  it("reverts multiple edited themes and the active theme switch", async () => {
    const { registry, ui } = create_harness();
    const theme_a = create_theme("custom-a", "Custom A", {
      font_size: 1.0,
    });
    const theme_b = create_theme("custom-b", "Custom B", {
      font_size: 1.1,
    });
    ui.set_user_themes([theme_a, theme_b]);
    ui.set_active_theme_id(theme_a.id);

    await registry.execute(ACTION_IDS.theme_update, {
      ...theme_a,
      font_size: 1.2,
    });
    await registry.execute(ACTION_IDS.theme_switch, theme_b.id);
    await registry.execute(ACTION_IDS.theme_update, {
      ...theme_b,
      font_size: 1.3,
    });
    await registry.execute(ACTION_IDS.theme_revert);

    expect(ui.user_themes).toEqual([theme_a, theme_b]);
    expect(ui.active_theme_id).toBe(theme_a.id);
    expect(ui.theme_has_draft).toBe(false);
  });

  it("persists draft changes only on explicit save", async () => {
    const { registry, ui, theme_service } = create_harness();
    const theme = create_theme("custom-a", "Custom A");
    ui.set_user_themes([theme]);
    ui.set_active_theme_id(theme.id);

    await registry.execute(ACTION_IDS.theme_update, {
      ...theme,
      font_size: 1.2,
    });
    await registry.execute(ACTION_IDS.theme_save);

    expect(theme_service.save_user_themes).toHaveBeenCalledWith([
      expect.objectContaining({
        id: theme.id,
        font_size: 1.2,
      }),
    ]);
    expect(theme_service.save_active_theme_id).toHaveBeenCalledWith(theme.id);
    expect(theme_service.save_color_scheme_preference).toHaveBeenCalledWith(
      ui.color_scheme_preference,
    );
    expect(ui.theme_has_draft).toBe(false);
  });
});
