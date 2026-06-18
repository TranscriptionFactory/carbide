export type SearchGraphMenuActions = {
  on_open: (path: string) => void;
  on_open_to_side?: ((path: string) => void) | undefined;
  on_copy_path?: ((path: string) => void) | undefined;
  on_reveal_in_file_manager?: ((path: string) => void) | undefined;
  on_open_in_default_app?: ((path: string) => void) | undefined;
  on_find_similar?: ((path: string) => void) | undefined;
  on_focus_node?: ((path: string) => void) | undefined;
};

export type SearchGraphMenuItem = {
  id:
    | "open"
    | "open_to_side"
    | "copy_path"
    | "reveal_in_file_manager"
    | "open_in_default_app"
    | "find_similar"
    | "focus_node";
  label: string;
  separator_before: boolean;
  select: () => void;
};

export function build_search_graph_result_menu(
  path: string,
  actions: SearchGraphMenuActions,
): SearchGraphMenuItem[] {
  const items: SearchGraphMenuItem[] = [
    {
      id: "open",
      label: "Open",
      separator_before: false,
      select: () => {
        actions.on_open(path);
      },
    },
  ];

  if (actions.on_open_to_side) {
    const on_open_to_side = actions.on_open_to_side;
    items.push({
      id: "open_to_side",
      label: "Open to Side",
      separator_before: false,
      select: () => {
        on_open_to_side(path);
      },
    });
  }

  if (actions.on_focus_node) {
    const on_focus_node = actions.on_focus_node;
    items.push({
      id: "focus_node",
      label: "Focus Node",
      separator_before: true,
      select: () => {
        on_focus_node(path);
      },
    });
  }

  if (actions.on_find_similar) {
    const on_find_similar = actions.on_find_similar;
    items.push({
      id: "find_similar",
      label: "Find Similar Notes",
      separator_before: !actions.on_focus_node,
      select: () => {
        on_find_similar(path);
      },
    });
  }

  if (actions.on_copy_path) {
    const on_copy_path = actions.on_copy_path;
    items.push({
      id: "copy_path",
      label: "Copy Path",
      separator_before: true,
      select: () => {
        on_copy_path(path);
      },
    });
  }

  if (actions.on_reveal_in_file_manager) {
    const on_reveal_in_file_manager = actions.on_reveal_in_file_manager;
    items.push({
      id: "reveal_in_file_manager",
      label: "Reveal in File Manager",
      separator_before: !actions.on_copy_path,
      select: () => {
        on_reveal_in_file_manager(path);
      },
    });
  }

  if (actions.on_open_in_default_app) {
    const on_open_in_default_app = actions.on_open_in_default_app;
    items.push({
      id: "open_in_default_app",
      label: "Open in Default App",
      separator_before: false,
      select: () => {
        on_open_in_default_app(path);
      },
    });
  }

  return items;
}
