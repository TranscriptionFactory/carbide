import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { SIDEBAR_VIEWS } from "$lib/app/sidebar_views";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { NotesStore } from "$lib/features/note";
import type { OutlineStore } from "$lib/features/outline";
import type { VimNavStore } from "$lib/features/vim_nav/state/vim_nav_store.svelte";
import { flatten_filetree } from "$lib/features/folder";
import type { FlatTreeNode } from "$lib/shared/types/filetree";

type VimNavActionInput = {
  registry: ActionRegistry;
  ui_store: UIStore;
  notes_store: NotesStore;
  outline_store: OutlineStore;
  vim_nav_store: VimNavStore;
};

export function register_vim_nav_actions(input: VimNavActionInput) {
  const { registry, ui_store, notes_store, outline_store, vim_nav_store } =
    input;

  function get_flat_nodes(): FlatTreeNode[] {
    return flatten_filetree({
      notes: notes_store.notes,
      folder_paths: notes_store.folder_paths,
      files: notes_store.files,
      expanded_paths: ui_store.filetree.expanded_paths,
      load_states: ui_store.filetree.load_states,
      error_messages: ui_store.filetree.error_messages,
      show_hidden_files: ui_store.editor_settings.show_hidden_files,
      pagination: ui_store.filetree.pagination,
    });
  }

  function get_selected_index(nodes: FlatTreeNode[]): number {
    const items = Array.from(ui_store.selected_items);
    const target =
      items.length > 0
        ? items[items.length - 1]
        : ui_store.selected_folder_path;
    if (!target) return -1;
    return nodes.findIndex((n) => n.path === target);
  }

  function select_node_at(nodes: FlatTreeNode[], index: number) {
    const node = nodes[index];
    if (node) ui_store.set_single_selected_item(node.path);
  }

  // File tree: move down
  registry.register({
    id: ACTION_IDS.vim_nav_file_tree_down,
    label: "Vim Nav: File Tree Down",
    execute: (count_arg?: unknown) => {
      const count = typeof count_arg === "number" ? count_arg : 1;
      const nodes = get_flat_nodes();
      if (nodes.length === 0) return;
      const current = get_selected_index(nodes);
      const target = Math.min(current + count, nodes.length - 1);
      select_node_at(nodes, target);
    },
  });

  // File tree: move up
  registry.register({
    id: ACTION_IDS.vim_nav_file_tree_up,
    label: "Vim Nav: File Tree Up",
    execute: (count_arg?: unknown) => {
      const count = typeof count_arg === "number" ? count_arg : 1;
      const nodes = get_flat_nodes();
      if (nodes.length === 0) return;
      const current = get_selected_index(nodes);
      const effective = current === -1 ? 0 : current;
      const target = Math.max(effective - count, 0);
      select_node_at(nodes, target);
    },
  });

  // File tree: collapse or go to parent
  registry.register({
    id: ACTION_IDS.vim_nav_file_tree_collapse,
    label: "Vim Nav: File Tree Collapse",
    execute: () => {
      const nodes = get_flat_nodes();
      const idx = get_selected_index(nodes);
      if (idx < 0) return;
      const node = nodes[idx]!;

      if (node.is_folder && node.is_expanded) {
        void registry.execute(ACTION_IDS.folder_toggle, node.path);
        return;
      }

      if (node.parent_path !== null) {
        const parent = nodes.find((n) => n.path === node.parent_path);
        if (parent) ui_store.set_single_selected_item(parent.path);
      }
    },
  });

  // File tree: expand or open
  registry.register({
    id: ACTION_IDS.vim_nav_file_tree_expand_or_open,
    label: "Vim Nav: File Tree Expand/Open",
    execute: () => {
      const nodes = get_flat_nodes();
      const idx = get_selected_index(nodes);
      if (idx < 0) return;
      const node = nodes[idx]!;

      if (node.is_folder) {
        if (!node.is_expanded) {
          void registry.execute(ACTION_IDS.folder_toggle, node.path);
        }
        return;
      }

      if (node.note) {
        void registry.execute(ACTION_IDS.note_open, node.path);
      } else if (node.file_meta) {
        void registry.execute(ACTION_IDS.document_open, node.path);
      }
    },
  });

  // File tree: jump to top
  registry.register({
    id: ACTION_IDS.vim_nav_file_tree_top,
    label: "Vim Nav: File Tree Top",
    execute: () => {
      const nodes = get_flat_nodes();
      if (nodes.length > 0) select_node_at(nodes, 0);
    },
  });

  // File tree: jump to bottom
  registry.register({
    id: ACTION_IDS.vim_nav_file_tree_bottom,
    label: "Vim Nav: File Tree Bottom",
    execute: () => {
      const nodes = get_flat_nodes();
      if (nodes.length > 0) select_node_at(nodes, nodes.length - 1);
    },
  });

  // File tree: focus search/filter
  registry.register({
    id: ACTION_IDS.vim_nav_file_tree_search,
    label: "Vim Nav: File Tree Search",
    execute: () => {
      const el = document.querySelector<HTMLElement>(
        ".FileTreeFilter__input, .Sidebar [data-vim-nav-search]",
      );
      el?.focus();
    },
  });

  // Outline: move down
  registry.register({
    id: ACTION_IDS.vim_nav_outline_down,
    label: "Vim Nav: Outline Down",
    execute: (count_arg?: unknown) => {
      const count = typeof count_arg === "number" ? count_arg : 1;
      const headings = outline_store.headings;
      if (headings.length === 0) return;
      const current_idx = headings.findIndex(
        (h) => h.id === outline_store.active_heading_id,
      );
      const target = Math.min(current_idx + count, headings.length - 1);
      const heading = headings[target];
      if (heading) outline_store.set_active_heading(heading.id);
    },
  });

  // Outline: move up
  registry.register({
    id: ACTION_IDS.vim_nav_outline_up,
    label: "Vim Nav: Outline Up",
    execute: (count_arg?: unknown) => {
      const count = typeof count_arg === "number" ? count_arg : 1;
      const headings = outline_store.headings;
      if (headings.length === 0) return;
      const current_idx = headings.findIndex(
        (h) => h.id === outline_store.active_heading_id,
      );
      const effective = current_idx === -1 ? 0 : current_idx;
      const target = Math.max(effective - count, 0);
      const heading = headings[target];
      if (heading) outline_store.set_active_heading(heading.id);
    },
  });

  // Outline: select (jump to heading)
  registry.register({
    id: ACTION_IDS.vim_nav_outline_select,
    label: "Vim Nav: Outline Select",
    execute: () => {
      const heading = outline_store.headings.find(
        (h) => h.id === outline_store.active_heading_id,
      );
      if (heading) {
        void registry.execute(
          ACTION_IDS.outline_scroll_to_heading,
          heading.pos,
        );
      }
    },
  });

  // Outline: jump to top
  registry.register({
    id: ACTION_IDS.vim_nav_outline_top,
    label: "Vim Nav: Outline Top",
    execute: () => {
      const heading = outline_store.headings[0];
      if (heading) outline_store.set_active_heading(heading.id);
    },
  });

  // Outline: jump to bottom
  registry.register({
    id: ACTION_IDS.vim_nav_outline_bottom,
    label: "Vim Nav: Outline Bottom",
    execute: () => {
      const heading = outline_store.headings[outline_store.headings.length - 1];
      if (heading) outline_store.set_active_heading(heading.id);
    },
  });

  // Focus: explorer
  registry.register({
    id: ACTION_IDS.vim_nav_focus_explorer,
    label: "Vim Nav: Focus Explorer",
    execute: () => {
      ui_store.sidebar_open = true;
      ui_store.set_sidebar_view(SIDEBAR_VIEWS.explorer);
      vim_nav_store.set_context("file_tree");
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          "[data-vim-nav-region='file_tree']",
        );
        el?.focus();
      });
    },
  });

  // Focus: outline
  registry.register({
    id: ACTION_IDS.vim_nav_focus_outline,
    label: "Vim Nav: Focus Outline",
    execute: () => {
      ui_store.context_rail_open = true;
      ui_store.set_context_rail_tab("outline");
      vim_nav_store.set_context("outline");
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          "[data-vim-nav-region='outline']",
        );
        el?.focus();
      });
    },
  });

  // Focus: editor (escape back)
  registry.register({
    id: ACTION_IDS.vim_nav_focus_editor,
    label: "Vim Nav: Focus Editor",
    execute: () => {
      vim_nav_store.set_context("none");
      const editor_el = document.querySelector<HTMLElement>(".ProseMirror");
      editor_el?.focus();
    },
  });

  // Cheatsheet toggle
  registry.register({
    id: ACTION_IDS.vim_nav_cheatsheet_toggle,
    label: "Vim Nav: Toggle Cheat Sheet",
    execute: () => {
      vim_nav_store.toggle_cheatsheet();
    },
  });
}
