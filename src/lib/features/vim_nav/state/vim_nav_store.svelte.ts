import type { NavContext } from "$lib/features/vim_nav/types/vim_nav_types";

export class VimNavStore {
  active_context = $state<NavContext>("none");
  pending_keys = $state("");
  cheatsheet_open = $state(false);

  set_context(context: NavContext) {
    if (context !== this.active_context) {
      this.pending_keys = "";
    }
    this.active_context = context;
  }

  set_pending_keys(keys: string) {
    this.pending_keys = keys;
  }

  clear_pending() {
    this.pending_keys = "";
  }

  toggle_cheatsheet() {
    this.cheatsheet_open = !this.cheatsheet_open;
  }

  reset() {
    this.active_context = "none";
    this.pending_keys = "";
    this.cheatsheet_open = false;
  }
}
