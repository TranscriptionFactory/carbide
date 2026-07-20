import {
  apply_theme,
  resolve_effective_source_shiki_theme,
} from "$lib/shared/utils/apply_theme";
import { resolve_layout_variant } from "$lib/app/bootstrap/layout_mode";
import { sync_window_material } from "$lib/features/window";
import type { UIStore } from "$lib/app";
import type { ThemeService } from "$lib/features/theme";

export function create_theme_reactor(
  ui_store: UIStore,
  theme_service: ThemeService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const layout_variant = resolve_layout_variant(
        ui_store.active_theme,
        ui_store.editor_settings.layout_preset,
      );
      apply_theme(ui_store.active_theme, {
        persist_to_cache: !ui_store.theme_has_draft,
        color_scheme_preference: ui_store.color_scheme_preference,
        layout_variant,
      });
      void sync_window_material(ui_store.active_theme.surface_style);
      const source_theme = resolve_effective_source_shiki_theme(
        ui_store.active_theme,
      );
      void theme_service.apply_source_shiki_theme(source_theme);
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
