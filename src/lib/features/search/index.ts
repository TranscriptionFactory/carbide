export { SearchService } from "$lib/features/search/application/search_service";
export { COMMANDS_REGISTRY } from "$lib/features/search/domain/search_commands";
export { COMMAND_TO_ACTION_ID } from "$lib/features/search/application/omnibar_actions";
export { register_omnibar_actions } from "$lib/features/search/application/omnibar_actions";
export { register_find_in_file_actions } from "$lib/features/search/application/find_in_file_actions";
export { SearchStore } from "$lib/features/search/state/search_store.svelte";
export type { IndexProgress } from "$lib/features/search/state/search_store.svelte";
export type {
  SearchPort,
  SmartLinkVaultEdge,
  WorkspaceIndexPort,
  NoteStats,
} from "$lib/features/search/ports";
export { create_search_tauri_adapter } from "$lib/features/search/adapters/search_tauri_adapter";
export { create_workspace_index_tauri_adapter } from "$lib/features/search/adapters/workspace_index_tauri_adapter";
export { default as Omnibar } from "$lib/features/search/ui/omnibar.svelte";
export { default as FindInFileBar } from "$lib/features/search/ui/find_in_file_bar.svelte";
export type {
  SearchNotesResult,
  WikiSuggestionsResult,
  OmnibarSearchResult,
  CrossVaultSearchResult,
} from "$lib/features/search/types/search_service_result";
export type {
  CommandId,
  CommandIcon,
  CommandDefinition,
  SearchCommandDefinition,
} from "$lib/features/search/types/command_palette";
