export * from "./types";
export * from "./ports";
export * from "./adapters/metadata_tauri_adapter";
export * from "./state/metadata_store.svelte";
export * from "./application/metadata_service";
export * from "./application/metadata_actions";
export { default as MetadataPanel } from "./ui/metadata_panel.svelte";

import { MetadataTauriAdapter } from "./adapters/metadata_tauri_adapter";
import type { MetadataPort } from "./ports";

export function create_metadata_tauri_adapter(): MetadataPort {
  return new MetadataTauriAdapter();
}
