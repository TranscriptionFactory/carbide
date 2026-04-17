<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import { to_transform_action_id } from "$lib/features/markdown_lsp";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  const { stores, action_registry, services } = use_app_context();

  const is_iwe = $derived(
    stores.ui.editor_settings.markdown_lsp_provider === "iwes" &&
      stores.markdown_lsp.status === "running",
  );

  const block_selection = $derived(services.editor.get_block_selection());
  const selection_count = $derived(block_selection.size);
  const has_multi_selection = $derived(selection_count > 1);

  const turn_into_items = [
    { id: ACTION_IDS.editor_turn_into_paragraph, label: "Paragraph" },
    { id: ACTION_IDS.editor_turn_into_heading_1, label: "Heading 1" },
    { id: ACTION_IDS.editor_turn_into_heading_2, label: "Heading 2" },
    { id: ACTION_IDS.editor_turn_into_heading_3, label: "Heading 3" },
    { separator: true },
    { id: ACTION_IDS.editor_turn_into_blockquote, label: "Blockquote" },
    { id: ACTION_IDS.editor_turn_into_bullet_list, label: "Bullet List" },
    { id: ACTION_IDS.editor_turn_into_ordered_list, label: "Ordered List" },
    { id: ACTION_IDS.editor_turn_into_todo_list, label: "Todo List" },
    { separator: true },
    { id: ACTION_IDS.editor_turn_into_code_block, label: "Code Block" },
    { id: ACTION_IDS.editor_turn_into_callout, label: "Callout" },
  ] as const;

  const turn_into_target_map: Record<
    string,
    { target: string; attrs?: Record<string, unknown> }
  > = {
    [ACTION_IDS.editor_turn_into_paragraph]: { target: "paragraph" },
    [ACTION_IDS.editor_turn_into_heading_1]: {
      target: "heading",
      attrs: { level: 1 },
    },
    [ACTION_IDS.editor_turn_into_heading_2]: {
      target: "heading",
      attrs: { level: 2 },
    },
    [ACTION_IDS.editor_turn_into_heading_3]: {
      target: "heading",
      attrs: { level: 3 },
    },
    [ACTION_IDS.editor_turn_into_blockquote]: { target: "blockquote" },
    [ACTION_IDS.editor_turn_into_bullet_list]: { target: "bullet_list" },
    [ACTION_IDS.editor_turn_into_ordered_list]: { target: "ordered_list" },
    [ACTION_IDS.editor_turn_into_todo_list]: { target: "todo_list" },
    [ACTION_IDS.editor_turn_into_code_block]: { target: "code_block" },
    [ACTION_IDS.editor_turn_into_callout]: { target: "callout" },
  };

  const refactor_items = [
    { id: ACTION_IDS.iwe_extract_section, label: "Extract Section" },
    { id: ACTION_IDS.iwe_extract_all, label: "Extract All Subsections" },
    { separator: true },
    { id: ACTION_IDS.iwe_inline_section, label: "Inline as Section" },
    { id: ACTION_IDS.iwe_inline_quote, label: "Inline as Quote" },
    { separator: true },
    { id: ACTION_IDS.iwe_list_to_sections, label: "List to Sections" },
    { id: ACTION_IDS.iwe_section_to_list, label: "Section to List" },
    { id: ACTION_IDS.iwe_sort_list, label: "Sort List" },
    { separator: true },
    { id: ACTION_IDS.iwe_create_link, label: "Create Link" },
  ] as const;

  const transform_items = $derived(
    stores.markdown_lsp.transform_actions.map((a) => ({
      id: to_transform_action_id(a.name),
      label: a.title,
    })),
  );

  function execute(action_id: string) {
    void action_registry.execute(action_id);
  }

  function handle_turn_into(action_id: string) {
    if (has_multi_selection) {
      const mapping = turn_into_target_map[action_id];
      if (mapping) {
        services.editor.batch_turn_into(
          mapping.target,
          mapping.attrs,
          block_selection,
        );
        services.editor.clear_block_selection();
        return;
      }
    }
    execute(action_id);
  }

  function handle_duplicate() {
    if (has_multi_selection) {
      services.editor.batch_duplicate(block_selection);
      services.editor.clear_block_selection();
    } else {
      execute(ACTION_IDS.editor_duplicate_block);
    }
  }

  function handle_delete() {
    if (has_multi_selection) {
      services.editor.batch_delete(block_selection);
      services.editor.clear_block_selection();
    } else {
      execute(ACTION_IDS.editor_delete_block);
    }
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="w-full h-full">
    {@render children()}
  </ContextMenu.Trigger>
  <ContextMenu.Portal>
    <ContextMenu.Content>
      {#if has_multi_selection}
        <ContextMenu.Label class="text-xs text-muted-foreground">
          {selection_count} blocks selected
        </ContextMenu.Label>
        <ContextMenu.Separator />
      {/if}
      <ContextMenu.Sub>
        <ContextMenu.SubTrigger>Turn Into</ContextMenu.SubTrigger>
        <ContextMenu.SubContent>
          {#each turn_into_items as item}
            {#if "separator" in item}
              <ContextMenu.Separator />
            {:else}
              <ContextMenu.Item onSelect={() => handle_turn_into(item.id)}>
                {item.label}
              </ContextMenu.Item>
            {/if}
          {/each}
        </ContextMenu.SubContent>
      </ContextMenu.Sub>
      <ContextMenu.Item onSelect={handle_duplicate}>
        Duplicate
        <span class="ml-auto text-xs text-muted-foreground">⇧⌘D</span>
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={handle_delete}>Delete</ContextMenu.Item>
      {#if is_iwe}
        <ContextMenu.Separator />
        <ContextMenu.Sub>
          <ContextMenu.SubTrigger>Refactor</ContextMenu.SubTrigger>
          <ContextMenu.SubContent>
            {#each refactor_items as item}
              {#if "separator" in item}
                <ContextMenu.Separator />
              {:else}
                <ContextMenu.Item onSelect={() => execute(item.id)}>
                  {item.label}
                </ContextMenu.Item>
              {/if}
            {/each}
          </ContextMenu.SubContent>
        </ContextMenu.Sub>
        {#if transform_items.length > 0}
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger>Transform</ContextMenu.SubTrigger>
            <ContextMenu.SubContent>
              {#each transform_items as item}
                <ContextMenu.Item onSelect={() => execute(item.id)}>
                  {item.label}
                </ContextMenu.Item>
              {/each}
            </ContextMenu.SubContent>
          </ContextMenu.Sub>
        {/if}
      {/if}
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
