import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";

export function register_find_in_file_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  const CLOSED_FIND_STATE = {
    open: false,
    query: "",
    selected_match_index: 0,
    replace_text: "",
    show_replace: false,
  } as const;

  function update_find_state(
    patch: Partial<ActionRegistrationInput["stores"]["ui"]["find_in_file"]>,
  ) {
    stores.ui.find_in_file = {
      ...stores.ui.find_in_file,
      ...patch,
    };
  }

  function close_find() {
    stores.ui.find_in_file = { ...CLOSED_FIND_STATE };
    stores.search.clear_in_file_matches();
  }

  function move_selection(step: 1 | -1) {
    const total_matches = stores.search.in_file_matches.length;
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
    const markdown = stores.editor.open_note?.markdown ?? "";
    const matches = services.search.search_within_file(markdown, query);
    stores.search.set_in_file_matches(matches);
  }

  registry.register({
    id: ACTION_IDS.find_in_file_toggle,
    label: "Toggle Find in File",
    shortcut: "CmdOrCtrl+F",
    execute: () => {
      update_find_state({ open: !stores.ui.find_in_file.open });
      if (!stores.ui.find_in_file.open) {
        stores.search.clear_in_file_matches();
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
      const { selected_match_index, query, replace_text } =
        stores.ui.find_in_file;
      const total = stores.search.in_file_matches.length;
      if (total === 0) return;
      services.editor.replace_at_match(selected_match_index, replace_text);
      const markdown = services.editor.get_markdown();
      const matches = services.search.search_within_file(markdown, query);
      stores.search.set_in_file_matches(matches);
      const new_index =
        matches.length > 0
          ? Math.min(selected_match_index, matches.length - 1)
          : 0;
      update_find_state({ selected_match_index: new_index });
    },
  });

  registry.register({
    id: ACTION_IDS.find_in_file_replace_all,
    label: "Replace All",
    execute: () => {
      const { query, replace_text } = stores.ui.find_in_file;
      if (stores.search.in_file_matches.length === 0) return;
      services.editor.replace_all_matches(replace_text);
      const markdown = services.editor.get_markdown();
      const matches = services.search.search_within_file(markdown, query);
      stores.search.set_in_file_matches(matches);
      update_find_state({ selected_match_index: 0 });
    },
  });
}
