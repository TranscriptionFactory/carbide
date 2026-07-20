<script lang="ts">
  import SidebarFileTree from "$lib/app/bootstrap/ui/sidebar_file_tree.svelte";
  import { SvelteSet } from "svelte/reactivity";
  import {
    build_filetree,
    sort_tree,
    derive_starred_tree,
  } from "$lib/features/folder";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";

  const { stores, action_registry } = use_app_context();

  let starred_expanded_node_ids = $state(new SvelteSet<string>());

  function toggle_starred_folder_node(node: {
    id: string;
    path: string;
    is_folder: boolean;
  }) {
    if (!node.is_folder) {
      return;
    }

    if (starred_expanded_node_ids.has(node.id)) {
      starred_expanded_node_ids.delete(node.id);
      return;
    }

    starred_expanded_node_ids.add(node.id);
    void action_registry.execute(ACTION_IDS.folder_retry_load, node.path);
  }

  const indexed_tree = $derived(
    sort_tree(
      build_filetree(
        stores.notes.notes,
        stores.notes.folder_paths,
        stores.notes.files,
      ),
    ),
  );

  const starred_nodes = $derived.by(() => {
    if (stores.notes.starred_paths.length === 0) {
      return [];
    }
    return derive_starred_tree({
      tree: indexed_tree,
      starred_paths: stores.notes.starred_paths,
      expanded_node_ids: starred_expanded_node_ids,
      load_states: stores.ui.filetree.load_states,
      error_messages: stores.ui.filetree.error_messages,
      show_hidden_files: stores.ui.editor_settings.show_hidden_files,
      pagination: stores.ui.filetree.pagination,
    });
  });

  $effect(() => {
    const valid_ids = new Set(starred_nodes.map((node) => node.id));
    for (const id of starred_expanded_node_ids) {
      if (!valid_ids.has(id)) {
        starred_expanded_node_ids.delete(id);
      }
    }
  });
</script>

<SidebarFileTree
  nodes={starred_nodes}
  on_toggle_folder_node={toggle_starred_folder_node}
  on_select_folder={(path: string) =>
    void action_registry.execute(ACTION_IDS.ui_select_folder, path)}
  manage_actions={false}
/>
