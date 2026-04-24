import type { SettingsPort } from "$lib/features/settings";
import type { OpStore } from "$lib/app";
import type { Theme, ColorSchemePreference } from "$lib/shared/types/theme";
import { resolve_source_shiki_vars } from "$lib/features/editor";
import {
  DEFAULT_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  DEFAULT_DARK_THEME_ID,
  create_user_theme,
} from "$lib/shared/types/theme";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("theme_service");

const THEMES_KEY = "user_themes";
const ACTIVE_THEME_ID_KEY = "active_theme_id";
const COLOR_SCHEME_PREF_KEY = "color_scheme_preference";
const SYSTEM_LIGHT_THEME_KEY = "system_light_theme_id";
const SYSTEM_DARK_THEME_KEY = "system_dark_theme_id";

export type ThemeLoadResult = {
  user_themes: Theme[];
  active_theme_id: string;
  color_scheme_preference: ColorSchemePreference;
  system_light_theme_id: string;
  system_dark_theme_id: string;
};

export class ThemeService {
  private applied_source_shiki_keys: string[] = [];
  private source_shiki_generation = 0;

  constructor(
    private readonly settings_port: SettingsPort,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number,
  ) {}

  async apply_source_shiki_theme(theme_name: string): Promise<void> {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const gen = ++this.source_shiki_generation;

    for (const key of this.applied_source_shiki_keys) {
      root.style.removeProperty(key);
    }
    this.applied_source_shiki_keys = [];

    try {
      const vars = await resolve_source_shiki_vars(theme_name);
      if (gen !== this.source_shiki_generation) return;

      const keys: string[] = [];
      for (const [key, value] of Object.entries(vars)) {
        root.style.setProperty(key, value);
        keys.push(key);
      }
      this.applied_source_shiki_keys = keys;
    } catch {
      // theme load failed — keep CSS defaults
    }
  }

  async load_themes(): Promise<ThemeLoadResult> {
    this.op_store.start("theme.load", this.now_ms());
    try {
      const [stored_themes, stored_id, stored_pref, stored_light, stored_dark] =
        await Promise.all([
          this.settings_port.get_setting<unknown>(THEMES_KEY),
          this.settings_port.get_setting<unknown>(ACTIVE_THEME_ID_KEY),
          this.settings_port.get_setting<unknown>(COLOR_SCHEME_PREF_KEY),
          this.settings_port.get_setting<unknown>(SYSTEM_LIGHT_THEME_KEY),
          this.settings_port.get_setting<unknown>(SYSTEM_DARK_THEME_KEY),
        ]);

      const user_themes = parse_stored_themes(stored_themes);
      const active_theme_id =
        typeof stored_id === "string" ? stored_id : DEFAULT_THEME_ID;
      const color_scheme_preference = is_color_scheme_preference(stored_pref)
        ? stored_pref
        : infer_preference_from_theme_id(active_theme_id);
      const system_light_theme_id =
        typeof stored_light === "string"
          ? stored_light
          : DEFAULT_LIGHT_THEME_ID;
      const system_dark_theme_id =
        typeof stored_dark === "string" ? stored_dark : DEFAULT_DARK_THEME_ID;

      this.op_store.succeed("theme.load");
      return {
        user_themes,
        active_theme_id,
        color_scheme_preference,
        system_light_theme_id,
        system_dark_theme_id,
      };
    } catch (error) {
      const msg = error_message(error);
      log.error("Load themes failed", { error: msg });
      this.op_store.fail("theme.load", msg);
      return {
        user_themes: [],
        active_theme_id: DEFAULT_THEME_ID,
        color_scheme_preference: "dark",
        system_light_theme_id: DEFAULT_LIGHT_THEME_ID,
        system_dark_theme_id: DEFAULT_DARK_THEME_ID,
      };
    }
  }

  async save_user_themes(themes: Theme[]): Promise<void> {
    try {
      const serializable = themes.filter((t) => !t.is_builtin);
      await this.settings_port.set_setting(THEMES_KEY, serializable);
    } catch (error) {
      log.error("Save themes failed", { error: error_message(error) });
    }
  }

  async save_active_theme_id(id: string): Promise<void> {
    try {
      await this.settings_port.set_setting(ACTIVE_THEME_ID_KEY, id);
    } catch (error) {
      log.error("Save active theme ID failed", {
        error: error_message(error),
      });
    }
  }

  async save_color_scheme_preference(
    pref: ColorSchemePreference,
  ): Promise<void> {
    try {
      await this.settings_port.set_setting(COLOR_SCHEME_PREF_KEY, pref);
    } catch (error) {
      log.error("Save color scheme preference failed", {
        error: error_message(error),
      });
    }
  }

  async save_system_theme_ids(
    light_id: string,
    dark_id: string,
  ): Promise<void> {
    try {
      await this.settings_port.set_setting(SYSTEM_LIGHT_THEME_KEY, light_id);
      await this.settings_port.set_setting(SYSTEM_DARK_THEME_KEY, dark_id);
    } catch (error) {
      log.error("Save system theme IDs failed", {
        error: error_message(error),
      });
    }
  }

  duplicate_theme(name: string, base: Theme): Theme {
    return create_user_theme(name, base);
  }
}

function parse_stored_themes(raw: unknown): Theme[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.filter(is_theme_record).map(migrate_theme);
}

function migrate_theme(theme: Theme): Theme {
  let migrated = theme;
  if (typeof migrated.auto_palette !== "boolean") {
    migrated = { ...migrated, auto_palette: false };
  }
  if (!migrated.shiki_theme_light) {
    migrated = { ...migrated, shiki_theme_light: "github-light" };
  }
  if (!migrated.shiki_theme_dark) {
    migrated = { ...migrated, shiki_theme_dark: "github-dark" };
  }
  if (typeof migrated.source_shiki_theme_light !== "string") {
    migrated = { ...migrated, source_shiki_theme_light: "" };
  }
  if (typeof migrated.source_shiki_theme_dark !== "string") {
    migrated = { ...migrated, source_shiki_theme_dark: "" };
  }
  if (typeof migrated.surface_hue !== "number") {
    migrated = {
      ...migrated,
      surface_hue: 68,
      surface_chroma: 0.008,
      surface_style: "solid" as const,
    };
  }
  return migrated;
}

function is_theme_record(entry: unknown): entry is Theme {
  if (typeof entry !== "object" || entry === null) return false;
  const candidate = entry as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    (candidate.color_scheme === "dark" || candidate.color_scheme === "light") &&
    typeof candidate.accent_hue === "number"
  );
}

const VALID_PREFS = new Set(["light", "dark", "system"]);

function is_color_scheme_preference(
  value: unknown,
): value is ColorSchemePreference {
  return typeof value === "string" && VALID_PREFS.has(value);
}

function infer_preference_from_theme_id(
  theme_id: string,
): ColorSchemePreference {
  return theme_id.endsWith("-light") ? "light" : "dark";
}
