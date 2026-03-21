import { apply_theme } from "$lib/shared/utils/apply_theme";
import type { UIStore } from "$lib/app";

export function create_theme_reactor(ui_store: UIStore): () => void {
  return $effect.root(() => {
    $effect(() => {
      apply_theme(ui_store.active_theme, {
        persist_to_cache: !ui_store.theme_has_draft,
        color_scheme_preference: ui_store.color_scheme_preference,
      });
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
