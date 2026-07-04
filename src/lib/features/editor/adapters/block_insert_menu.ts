import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_commands,
  create_menu_el,
  render_items,
  type SlashCommand,
  type SlashState,
} from "./slash_command_plugin";
import {
  position_suggest_dropdown,
  scroll_selected_into_view,
  attach_outside_dismiss,
  mount_dropdown,
  destroy_dropdown,
} from "./suggest_dropdown_utils";

export type BlockInsertMenu = {
  open: (anchor: DOMRect, insert_from: number) => void;
  destroy: () => void;
};

export function block_insert_commands(state: EditorState): SlashCommand[] {
  return create_commands().filter(
    (cmd) => !cmd.is_available || cmd.is_available(state),
  );
}

export function create_block_insert_menu(view: EditorView): BlockInsertMenu {
  const { menu, live_region } = create_menu_el();
  const preview_cache = new Map<string, HTMLElement>();
  mount_dropdown(menu);

  let commands: SlashCommand[] = [];
  let selected_index = 0;
  let from = 0;
  let is_open = false;
  let detach_dismiss: (() => void) | null = null;

  function menu_state(): SlashState {
    return {
      active: true,
      query: "",
      from,
      selected_index,
      filtered: commands,
    };
  }

  function scroll_selected(): void {
    const list = menu.querySelector<HTMLElement>(".SlashMenu__list");
    if (list) scroll_selected_into_view(list, selected_index);
  }

  function render(): void {
    render_items(
      menu,
      live_region,
      menu_state(),
      (index) => {
        selected_index = index;
        render();
      },
      accept,
      preview_cache,
    );
  }

  function accept(cmd: SlashCommand): void {
    close();
    cmd.insert(view, from);
    view.focus();
  }

  function close(): void {
    if (!is_open) return;
    is_open = false;
    menu.style.display = "none";
    detach_dismiss?.();
    detach_dismiss = null;
    document.removeEventListener("keydown", on_keydown, true);
  }

  function on_keydown(event: KeyboardEvent): void {
    if (!is_open || commands.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      selected_index = (selected_index + 1) % commands.length;
      render();
      scroll_selected();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      selected_index = (selected_index - 1 + commands.length) % commands.length;
      render();
      scroll_selected();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      const cmd = commands[selected_index];
      if (cmd) accept(cmd);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  function open(anchor: DOMRect, insert_from: number): void {
    from = insert_from;
    selected_index = 0;
    commands = block_insert_commands(view.state);
    if (commands.length === 0) return;

    is_open = true;
    render();
    scroll_selected();
    menu.style.display = "block";
    position_suggest_dropdown(menu, {
      getBoundingClientRect: () => anchor,
    } as Element);
    detach_dismiss = attach_outside_dismiss(menu, view.dom, close);
    document.addEventListener("keydown", on_keydown, true);
  }

  return {
    open,
    destroy() {
      close();
      destroy_dropdown(menu, null);
    },
  };
}
