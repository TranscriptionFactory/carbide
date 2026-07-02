import type { SurfaceStyle } from "$lib/shared/types/theme";
import { is_tauri } from "$lib/features/window/domain/platform";

const GLASS_MATERIAL_CLASS = "data-tauri-material";

async function apply_tauri_vibrancy(): Promise<void> {
  const { getCurrentWindow, Effect, EffectState } = await import(
    "@tauri-apps/api/window"
  );
  const win = getCurrentWindow();
  await win.setEffects({
    effects: [Effect.Acrylic, Effect.UnderWindowBackground],
    state: EffectState.Active,
    radius: 0,
  });
}

async function clear_tauri_vibrancy(): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  await win.clearEffects();
}

export async function sync_window_material(
  surface_style: SurfaceStyle,
): Promise<void> {
  if (!is_tauri()) return;

  const wants_material = surface_style === "glass";

  if (wants_material) {
    document.documentElement.setAttribute(GLASS_MATERIAL_CLASS, "true");
    await apply_tauri_vibrancy().catch(() => {
      document.documentElement.removeAttribute(GLASS_MATERIAL_CLASS);
    });
  } else {
    document.documentElement.removeAttribute(GLASS_MATERIAL_CLASS);
    await clear_tauri_vibrancy().catch(() => {});
  }
}
