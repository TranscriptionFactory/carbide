import {
  apply_theme,
  resolve_effective_source_shiki_theme,
} from "$lib/shared/utils/apply_theme";
import { resolve_source_shiki_vars } from "$lib/features/editor/adapters/shiki_source_theme";
import type { UIStore } from "$lib/app";

let applied_source_shiki_keys: string[] = [];
let source_shiki_generation = 0;

async function apply_source_shiki_theme(theme_name: string): Promise<void> {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const gen = ++source_shiki_generation;

  for (const key of applied_source_shiki_keys) {
    root.style.removeProperty(key);
  }
  applied_source_shiki_keys = [];

  try {
    const vars = await resolve_source_shiki_vars(theme_name);
    if (gen !== source_shiki_generation) return;

    const keys: string[] = [];
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
      keys.push(key);
    }
    applied_source_shiki_keys = keys;
  } catch {
    // theme load failed — keep CSS defaults
  }
}

export function create_theme_reactor(ui_store: UIStore): () => void {
  return $effect.root(() => {
    $effect(() => {
      apply_theme(ui_store.active_theme, {
        persist_to_cache: !ui_store.theme_has_draft,
        color_scheme_preference: ui_store.color_scheme_preference,
      });
      const source_theme = resolve_effective_source_shiki_theme(
        ui_store.active_theme,
      );
      void apply_source_shiki_theme(source_theme);
    });

    if (typeof window !== "undefined") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      ui_store.set_system_prefers_dark(mql.matches);

      const handler = (e: MediaQueryListEvent) => {
        ui_store.set_system_prefers_dark(e.matches);
      };
      mql.addEventListener("change", handler);

      $effect(() => {
        return () => mql.removeEventListener("change", handler);
      });
    }
  });
}
