export {
  type WindowKind,
  type WindowInit,
  compute_title,
  parse_window_init,
  serialize_window_init,
  get_window_init_from_url,
} from "./domain/window_types";
export { type WindowPort } from "./ports";
export { create_window_tauri_adapter } from "./adapters/window_tauri_adapter";
