import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";

const FIND_DEBOUNCE_MS = 100;

export function register_find_in_file_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  const CLOSED_FIND_STATE = {
    open: false,
    query: "",
    selected_match_index: 0,
    replace_text: "",
    show_replace: false,
  } as const;

  let find_debounce_timer: ReturnType<typeof setTimeout> | null = null;

  function cancel_find_debounce() {
    if (find_debounce_timer !== null) {
      clearTimeout(find_debounce_timer);
      find_debounce_timer = null;
    }
  }

  function update_find_state(
    patch: Partial<ActionRegistrationInput["stores"]["ui"]["find_in_file"]>,
  ) {
    const state = stores.ui.find_in_file;
    for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
      (state as Record<string, unknown>)[key] = patch[key];
    }
  }

  function close_find() {
    cancel_find_debounce();
    update_find_state(CLOSED_FIND_STATE);
    stores.search.set_find_match_count(0);
  }

  function move_selection(step: 1 | -1) {
    const total_matches = stores.search.find_match_count;
    if (total_matches === 0) {
      return;
    }
    const current_index = stores.ui.find_in_file.selected_match_index;
    const next_index = (current_index + step + total_matches) % total_matches;
    update_find_state({ selected_match_index: next_index });
  }

  function update_query(query: string) {
    update_find_state({
      query,
      selected_match_index: 0,
    });

    cancel_find_debounce();

    if (!query.trim()) {
      stores.search.set_find_match_count(0);
      return;
    }

    find_debounce_timer = setTimeout(() => {
      find_debounce_timer = null;
    }, FIND_DEBOUNCE_MS);
  }

  registry.register({
    id: ACTION_IDS.find_in_file_toggle,
    label: "Toggle Find in File",
    shortcut: "CmdOrCtrl+F",
    execute: () => {
      update_find_state({ open: !stores.ui.find_in_file.open });
      if (!stores.ui.find_in_file.open) {
        cancel_find_debounce();
        stores.search.set_find_match_count(0);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_open,
    label: "Open Find in File",
    execute: () => {
      update_find_state({ open: true });
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_close,
    label: "Close Find in File",
    execute: () => {
      close_find();
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_set_query,
    label: "Set Find in File Query",
    execute: (query: unknown) => {
      update_query(String(query));
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_next,
    label: "Find Next",
    shortcut: "CmdOrCtrl+G",
    execute: () => {
      move_selection(1);
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_prev,
    label: "Find Previous",
    shortcut: "Shift+CmdOrCtrl+G",
    execute: () => {
      move_selection(-1);
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_toggle_replace,
    label: "Find and Replace",
    shortcut: "CmdOrCtrl+H",
    execute: () => {
      const currently_showing = stores.ui.find_in_file.show_replace;
      update_find_state({ open: true, show_replace: !currently_showing });
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_set_replace_text,
    label: "Set Replace Text",
    execute: (text: unknown) => {
      update_find_state({ replace_text: String(text) });
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_replace_one,
    label: "Replace",
    execute: () => {
      const { selected_match_index, replace_text } = stores.ui.find_in_file;
      const total = stores.search.find_match_count;
      if (total === 0) return;
      services.editor.replace_at_match(selected_match_index, replace_text);
      const new_index =
        stores.search.find_match_count > 0
          ? Math.min(selected_match_index, stores.search.find_match_count - 1)
          : 0;
      update_find_state({ selected_match_index: new_index });
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_replace_all,
    label: "Replace All",
    execute: () => {
      const { replace_text } = stores.ui.find_in_file;
      if (stores.search.find_match_count === 0) return;
      services.editor.replace_all_matches(replace_text);
      update_find_state({ selected_match_index: 0 });
    },
  });
}
