import { describe, expect, it, vi } from "vitest";
import {
  ThemeService,
  remap_theme_id,
} from "$lib/features/theme/application/theme_service";
import { BUILTIN_THEMES, BUILTIN_CARBIDE_DARK } from "$lib/shared/types/theme";

const NO_USER_THEMES: { id: string }[] = [];

describe("remap_theme_id — spec §7 fallback table", () => {
  const TABLE: Array<[string, string]> = [
    ["nordic-light", "carbide-light"],
    ["nordic-dark", "carbide-dark"],
    ["brutalist-light", "carbide-light"],
    ["brutalist-dark", "carbide-dark"],
    ["dense-light", "carbide-light"],
    ["dense-dark", "carbide-dark"],
    ["linear-light", "carbide-light"],
    ["linear-dark", "carbide-dark"],
    ["monolith-light", "carbide-light"],
    ["monolith-dark", "carbide-dark"],
    ["workbench-light", "carbide-light"],
    ["workbench-dark", "carbide-dark"],
    ["lattice-light", "carbide-light"],
    ["lattice-dark", "carbide-dark"],
    ["paper-light", "spotlight-light"],
    ["paper-dark", "spotlight-dark"],
    ["triptych-light", "spotlight-light"],
    ["triptych-dark", "spotlight-dark"],
    ["zen-deck-dark", "spotlight-dark"],
    ["neon-light", "theater-light"],
    ["neon-dark", "theater-dark"],
    ["command-deck-light", "theater-light"],
    ["command-deck-dark", "theater-dark"],
    ["cockpit-light", "theater-light"],
    ["cockpit-dark", "theater-dark"],
    ["terminal-light", "theater-light"],
    ["terminal-dark", "theater-dark"],
    ["grounded-heavy-dark", "theater-dark"],
    ["hud-dark", "theater-dark"],
    ["dashboard-dark", "obsidian-dark"],
    ["drift-light", "obsidian-light"],
    ["drift-dark", "obsidian-dark"],
    ["floating-light", "glass-light"],
    ["floating-dark", "glass-dark"],
  ];

  it.each(TABLE)("%s → %s", (culled, kept) => {
    expect(remap_theme_id(culled, NO_USER_THEMES)).toBe(kept);
  });
});

describe("remap_theme_id — pass-through and unknown ids", () => {
  it("passes every kept builtin id through unchanged", () => {
    for (const theme of BUILTIN_THEMES) {
      expect(remap_theme_id(theme.id, NO_USER_THEMES)).toBe(theme.id);
    }
  });

  it("passes user themes (UUID ids) through unchanged", () => {
    const uuid = "3f2b1a04-9c1d-4e7a-8f60-0d1c2b3a4d5e";
    expect(remap_theme_id(uuid, [{ id: uuid }])).toBe(uuid);
  });

  it("remaps a user-theme-shaped id that is not in user_themes", () => {
    const uuid = "3f2b1a04-9c1d-4e7a-8f60-0d1c2b3a4d5e";
    expect(remap_theme_id(uuid, NO_USER_THEMES)).toBe("carbide-dark");
  });

  it("maps unknown ids to carbide by -light suffix", () => {
    expect(remap_theme_id("mystery-light", NO_USER_THEMES)).toBe(
      "carbide-light",
    );
  });

  it("maps unknown ids without a -light suffix to carbide-dark", () => {
    expect(remap_theme_id("mystery-dark", NO_USER_THEMES)).toBe("carbide-dark");
    expect(remap_theme_id("mystery", NO_USER_THEMES)).toBe("carbide-dark");
    expect(remap_theme_id("", NO_USER_THEMES)).toBe("carbide-dark");
  });
});

function create_service(stored: Record<string, unknown>) {
  const settings_port = {
    get_setting: vi.fn(async (key: string) => stored[key] ?? null),
    set_setting: vi.fn(async () => undefined),
  };
  const op_store = {
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  };
  const service = new ThemeService(
    settings_port as never,
    op_store as never,
    () => 0,
  );
  return { service, settings_port };
}

describe("ThemeService.load_themes — cull remap + persist-once", () => {
  it("remaps all three persisted id keys", async () => {
    const { service } = create_service({
      active_theme_id: "cockpit-dark",
      system_light_theme_id: "paper-light",
      system_dark_theme_id: "drift-dark",
    });
    const result = await service.load_themes();
    expect(result.active_theme_id).toBe("theater-dark");
    expect(result.system_light_theme_id).toBe("spotlight-light");
    expect(result.system_dark_theme_id).toBe("obsidian-dark");
  });

  it("persists remapped ids once so settings self-heal", async () => {
    const { service, settings_port } = create_service({
      active_theme_id: "nordic-dark",
      system_light_theme_id: "nordic-light",
      system_dark_theme_id: "nordic-dark",
    });
    await service.load_themes();
    const writes = settings_port.set_setting.mock.calls;
    expect(writes).toContainEqual(["active_theme_id", "carbide-dark"]);
    expect(writes).toContainEqual(["system_light_theme_id", "carbide-light"]);
    expect(writes).toContainEqual(["system_dark_theme_id", "carbide-dark"]);
  });

  it("does not write settings when persisted ids are already kept", async () => {
    const { service, settings_port } = create_service({
      active_theme_id: "carbide-dark",
      system_light_theme_id: "spotlight-light",
      system_dark_theme_id: "obsidian-dark",
    });
    const result = await service.load_themes();
    expect(result.active_theme_id).toBe("carbide-dark");
    expect(settings_port.set_setting).not.toHaveBeenCalled();
  });

  it("keeps a persisted user theme id that exists in user_themes", async () => {
    const user_theme = {
      ...BUILTIN_CARBIDE_DARK,
      id: "5a6b7c8d-1e2f-4a3b-9c0d-e1f2a3b4c5d6",
      name: "My Theme",
      is_builtin: false,
    };
    const { service, settings_port } = create_service({
      active_theme_id: user_theme.id,
      user_themes: [user_theme],
    });
    const result = await service.load_themes();
    expect(result.active_theme_id).toBe(user_theme.id);
    expect(settings_port.set_setting).not.toHaveBeenCalled();
  });

  it("preference inference still works on remapped ids (suffix preserved)", async () => {
    const { service } = create_service({ active_theme_id: "paper-light" });
    const result = await service.load_themes();
    expect(result.color_scheme_preference).toBe("light");
  });
});
