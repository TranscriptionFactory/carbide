export { register_settings_actions } from "$lib/features/settings/application/settings_actions";
export {
  SettingsService,
  WELCOME_STATE_VERSION,
  type WelcomeState,
} from "$lib/features/settings/application/settings_service";
export type {
  SettingsPort,
  StoragePort,
  StorageStats,
  VaultDbInfo,
} from "$lib/features/settings/ports";
export { create_settings_tauri_adapter } from "$lib/features/settings/adapters/settings_tauri_adapter";
export { create_storage_tauri_adapter } from "$lib/features/settings/adapters/storage_tauri_adapter";
export {
  SETTINGS_REGISTRY,
  type SettingDefinition,
} from "$lib/features/settings/domain/settings_catalog";
export { default as SettingsDialog } from "$lib/features/settings/ui/settings_dialog.svelte";
export type { EditorSettings } from "$lib/shared/types/editor_settings";
export type {
  SettingsLoadResult,
  SettingsSaveResult,
} from "$lib/features/settings/types/settings_service_result";
