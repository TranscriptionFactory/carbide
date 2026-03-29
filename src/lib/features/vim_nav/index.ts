export { VimNavStore } from "$lib/features/vim_nav/state/vim_nav_store.svelte";
export {
  resolve_key_sequence,
  is_vim_nav_prefix,
  ALL_BINDINGS,
} from "$lib/features/vim_nav/domain/vim_nav_keymap";
export {
  process_key,
  clear_sequence,
  create_key_sequence_state,
} from "$lib/features/vim_nav/domain/key_sequence";
export { register_vim_nav_actions } from "$lib/features/vim_nav/application/vim_nav_actions";
export { default as VimNavCheatsheet } from "$lib/features/vim_nav/ui/vim_nav_cheatsheet.svelte";
export { default as VimNavStatusIndicator } from "$lib/features/vim_nav/ui/vim_nav_status_indicator.svelte";
export type {
  NavContext,
  KeySequenceResult,
  VimNavBinding,
  VimNavContextBindings,
} from "$lib/features/vim_nav/types/vim_nav_types";
