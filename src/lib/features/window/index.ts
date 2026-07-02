export type {
  WindowKind,
  WindowInit,
} from "$lib/features/window/domain/window_types";
export {
  parse_window_init,
  compute_title,
} from "$lib/features/window/domain/window_types";
export type { WindowPort } from "$lib/features/window/ports";
export { create_window_tauri_adapter } from "$lib/features/window/adapters/window_tauri_adapter";
export { register_window_actions } from "$lib/features/window/application/window_actions";
export {
  is_linux,
  is_mac,
  is_windows,
  is_tauri,
  should_use_custom_window_chrome,
  MACOS_TRAFFIC_LIGHT_SAFE_PADDING,
} from "$lib/features/window/domain/platform";
export { sync_window_material } from "$lib/features/window/domain/window_material";
