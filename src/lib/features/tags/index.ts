export * from "./types";
export * from "./ports";
export * from "./adapters/tag_tauri_adapter";
export * from "./state/tag_store.svelte";
export * from "./application/tag_service";
export * from "./application/tag_actions";
export { default as TagPanel } from "./ui/tag_panel.svelte";

import { TagTauriAdapter } from "./adapters/tag_tauri_adapter";
import type { TagPort } from "./ports";

export function create_tag_tauri_adapter(): TagPort {
  return new TagTauriAdapter();
}
