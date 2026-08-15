import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { resolve_find_open_state } from "$lib/features/editor";

const FIND_DEBOUNCE_MS = 100;

export function register_find_in_file_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  const CLOSED_FIND_STATE = {
    open: false,
    query: "",
    selected_match_index: 0,
    replace_text: "",
    show_replace: false,
    scope: "document",
    scope_range: null,
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

  // Read before the bar steals focus: the selection is gone by the time the
  // input is focused, so scope and seed query have to be captured on open.
  function open_find() {
    const open_state = resolve_find_open_state(
      services.editor.get_selection_range(),
    );
    update_find_state({
      open: true,
      selected_match_index: 0,
      scope: open_state.scope,
      scope_range: open_state.scope_range,
      ...(open_state.query === null ? {} : { query: open_state.query }),
    });
  }

  registry.register({
    id: ACTION_IDS.find_in_file_toggle,
    label: "Toggle Find in File",
    shortcut: "CmdOrCtrl+F",
    execute: () => {
      if (stores.ui.find_in_file.open) {
        update_find_state({
          open: false,
          scope: "document",
          scope_range: null,
        });
        cancel_find_debounce();
        stores.search.set_find_match_count(0);
        return;
      }
      open_find();
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_open,
    label: "Open Find in File",
    execute: () => {
      open_find();
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
      if (!stores.ui.find_in_file.open) open_find();
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
      if (stores.search.find_match_count === 0) return;
      const result = services.editor.replace_at_match(
        selected_match_index,
        replace_text,
      );
      stores.search.set_find_match_count(result.match_count);
      update_find_state({ selected_match_index: result.selected_index });
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_replace_all,
    label: "Replace All",
    execute: () => {
      const { replace_text } = stores.ui.find_in_file;
      if (stores.search.find_match_count === 0) return;
      const result = services.editor.replace_all_matches(replace_text);
      stores.search.set_find_match_count(result.match_count);
      update_find_state({ selected_match_index: result.selected_index });
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_toggle_case,
    label: "Toggle Match Case",
    execute: () => {
      update_find_state({
        case_sensitive: !stores.ui.find_in_file.case_sensitive,
        selected_match_index: 0,
      });
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_toggle_whole_word,
    label: "Toggle Whole Word",
    execute: () => {
      update_find_state({
        whole_word: !stores.ui.find_in_file.whole_word,
        selected_match_index: 0,
      });
    },
  });
}
