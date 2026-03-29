import type { HotkeyConfig } from "$lib/features/hotkey";
import type { ActionRegistry } from "$lib/app";
import { normalize_event_to_key } from "$lib/features/hotkey";
import type { VimNavStore } from "$lib/features/vim_nav";
import {
  process_key,
  clear_sequence,
  create_key_sequence_state,
} from "$lib/features/vim_nav";

export type KeyboardShortcuts = {
  handle_keydown_capture: (event: KeyboardEvent) => void;
  handle_keydown: (event: KeyboardEvent) => void;
};

export function use_keyboard_shortcuts(input: {
  hotkeys_config: () => HotkeyConfig;
  is_enabled: () => boolean;
  is_blocked: () => boolean;
  is_omnibar_open: () => boolean;
  is_vault_switcher_open: () => boolean;
  is_terminal_focused: () => boolean;
  has_tabs: () => boolean;
  vim_nav_enabled: () => boolean;
  vim_nav_store: () => VimNavStore;
  action_registry: ActionRegistry;
  on_close_vault_switcher: () => void;
  on_select_pinned_vault: (slot: number) => void;
  on_switch_to_tab: (index: number) => void;
}): KeyboardShortcuts {
  const {
    hotkeys_config,
    is_enabled,
    is_blocked,
    is_omnibar_open,
    is_vault_switcher_open,
    is_terminal_focused,
    has_tabs,
    vim_nav_enabled,
    vim_nav_store,
    action_registry,
    on_close_vault_switcher,
    on_select_pinned_vault,
    on_switch_to_tab,
  } = input;

  const vim_seq = create_key_sequence_state();

  const build_key_maps = () => {
    const config = hotkeys_config();
    const capture_map = new Map<string, string>();
    const bubble_map = new Map<string, string>();

    for (const binding of config.bindings) {
      if (binding.key === null) continue;
      const target_map = binding.phase === "capture" ? capture_map : bubble_map;
      target_map.set(binding.key, binding.action_id);
    }

    return { capture_map, bubble_map };
  };

  const is_mod_combo = (event: KeyboardEvent, key: string): boolean => {
    if (!(event.metaKey || event.ctrlKey)) return false;
    return event.key.toLowerCase() === key;
  };

  const tab_number_slot = (event: KeyboardEvent): number | null => {
    if (!(event.metaKey || event.ctrlKey)) return null;
    if (event.altKey || event.shiftKey) return null;
    if (event.key < "1" || event.key > "9") return null;
    return Number(event.key) - 1;
  };

  const is_bare_key = (event: KeyboardEvent): boolean =>
    !event.metaKey && !event.ctrlKey && !event.altKey;

  const is_input_element = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return target.isContentEditable;
  };

  const try_vim_nav = (event: KeyboardEvent): boolean => {
    if (!vim_nav_enabled()) return false;
    if (is_input_element(event.target)) return false;

    const store = vim_nav_store();
    if (store.active_context === "none") return false;

    if (!is_bare_key(event) && event.key !== "Enter" && event.key !== "Escape")
      return false;

    const key =
      event.key === " " ? " " : event.key.length === 1 ? event.key : event.key;

    const result = process_key(vim_seq, store.active_context, key, () => {
      store.clear_pending();
    });

    if (result.status === "matched") {
      event.preventDefault();
      event.stopPropagation();
      store.clear_pending();
      if (result.count > 1) {
        void action_registry.execute(result.action_id, result.count);
      } else {
        void action_registry.execute(result.action_id);
      }
      return true;
    }

    if (result.status === "pending") {
      event.preventDefault();
      event.stopPropagation();
      store.set_pending_keys(vim_seq.pending);
      return true;
    }

    return false;
  };

  const handle_keydown_capture = (event: KeyboardEvent) => {
    if (is_mod_combo(event, "w") && is_vault_switcher_open()) {
      event.preventDefault();
      event.stopPropagation();
      on_close_vault_switcher();
      return;
    }

    const slot = tab_number_slot(event);
    if (slot !== null) {
      if (!is_enabled()) return;
      event.preventDefault();
      event.stopPropagation();
      if (is_blocked()) return;
      if (has_tabs()) {
        on_switch_to_tab(slot);
      } else if (slot < 5) {
        on_select_pinned_vault(slot);
      }
      return;
    }

    if (!is_enabled()) return;

    // Vim nav intercepts bare keys before hotkey processing
    if (is_bare_key(event) && !is_blocked()) {
      if (try_vim_nav(event)) return;
    }

    const in_terminal = is_terminal_focused();

    // When terminal is focused, only intercept modifier combos (CmdOrCtrl/Alt)
    if (in_terminal && !(event.metaKey || event.ctrlKey || event.altKey))
      return;

    const { capture_map } = build_key_maps();
    const key = normalize_event_to_key(event);
    const action_id = capture_map.get(key);

    if (action_id) {
      event.preventDefault();
      event.stopPropagation();

      if (is_blocked() && !is_omnibar_open()) return;

      void action_registry.execute(action_id);
    }
  };

  const handle_keydown = (event: KeyboardEvent) => {
    if (!is_enabled()) return;
    if (is_terminal_focused()) return;

    // Vim nav for bubble phase (bare keys not caught in capture)
    if (is_bare_key(event) && !is_blocked()) {
      if (try_vim_nav(event)) return;
    }

    const { bubble_map } = build_key_maps();
    const key = normalize_event_to_key(event);
    const action_id = bubble_map.get(key);

    if (action_id) {
      event.preventDefault();
      event.stopPropagation();

      if (is_blocked()) return;

      void action_registry.execute(action_id);
    }
  };

  return {
    handle_keydown_capture,
    handle_keydown,
  };
}
