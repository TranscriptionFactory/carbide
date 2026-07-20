import type { Theme, ThemeLayoutVariant } from "$lib/shared/types/theme";
import type { LayoutPreset } from "$lib/shared/types/editor_settings";

export type PanelsMode = "docked" | "overlay";

export function resolve_layout_variant(
  theme: Theme,
  preset: LayoutPreset,
): ThemeLayoutVariant {
  if (preset !== "auto") return preset;
  return theme.layout_variant;
}

export function panels_mode(variant: ThemeLayoutVariant): PanelsMode {
  return variant === "spotlight" || variant === "theater"
    ? "overlay"
    : "docked";
}
