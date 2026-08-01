<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import { to_transform_action_id } from "$lib/features/markdown_lsp";
  import { create_logger } from "$lib/shared/utils/logger";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  const log = create_logger("editor_context_menu");

  const { stores, action_registry, services } = use_app_context();

  const is_iwe = $derived(
    stores.ui.editor_settings.markdown_lsp_provider === "iwes" &&
      stores.markdown_lsp.status === "running",
  );

  let block_selection = $state(new Set<number>());
  let target_block_pos = $state<number | null>(null);

  const selection_count = $derived(block_selection.size);
  const has_multi_selection = $derived(selection_count > 1);

  function capture_context_target(event: MouseEvent) {
    target_block_pos = services.editor.block_pos_at_coords(
      event.clientX,
      event.clientY,
      event.target instanceof Element ? event.target : null,
    );
    block_selection = services.editor.get_block_selection();
  }

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
    {
      id: ACTION_IDS.editor_turn_into_details_block,
      label: "Collapsible Section",
    },
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
    [ACTION_IDS.editor_turn_into_details_block]: { target: "details_block" },
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

  const single_target = $derived.by(() => {
    if (target_block_pos != null) return target_block_pos;
    if (block_selection.size === 1) return [...block_selection][0] ?? null;
    return null;
  });

  const can_copy_block_link = $derived(
    single_target != null &&
      services.editor.block_supports_id_at(single_target),
  );

  function resolve_target_blocks(): Set<number> | null {
    if (has_multi_selection) return block_selection;
    return single_target == null ? null : new Set([single_target]);
  }

  function warn_unresolved(operation: string) {
    log.warn("no block resolved under the context menu target", { operation });
  }

  function apply_block_op(op: {
    batch: (positions: Set<number>) => void;
    single: (pos: number) => void;
    name: string;
  }) {
    const positions = resolve_target_blocks();
    if (!positions) {
      warn_unresolved(op.name);
      return;
    }
    if (positions.size > 1) {
      op.batch(positions);
      services.editor.clear_block_selection();
      return;
    }
    const [pos] = positions;
    if (pos != null) op.single(pos);
  }

  function handle_copy() {
    const positions = resolve_target_blocks();
    if (!positions) {
      warn_unresolved("copy");
      return;
    }
    const payload = services.editor.copy_blocks_payload(positions);
    if (!payload) return;
    void services.clipboard.copy_rich(payload);
  }

  function handle_duplicate() {
    apply_block_op({
      name: "duplicate",
      batch: (positions) => services.editor.batch_duplicate(positions),
      single: (pos) => services.editor.duplicate_block_at(pos),
    });
  }

  function handle_delete() {
    apply_block_op({
      name: "delete",
      batch: (positions) => services.editor.batch_delete(positions),
      single: (pos) => services.editor.delete_block_at(pos),
    });
  }

  function handle_insert(placement: "above" | "below") {
    if (single_target == null) {
      warn_unresolved(`insert_${placement}`);
      return;
    }
    services.editor.insert_block_at(single_target, placement);
  }

  function handle_copy_block(action_id: string) {
    if (single_target == null) {
      warn_unresolved(action_id);
      return;
    }
    void action_registry.execute(action_id, single_target);
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger
    class="w-full h-full"
    oncontextmenu={capture_context_target}
  >
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
      <ContextMenu.Item onSelect={handle_copy}>
        Copy
        <span class="ml-auto text-xs text-muted-foreground">⌘C</span>
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={handle_duplicate}>
        Duplicate
        <span class="ml-auto text-xs text-muted-foreground">⇧⌘D</span>
      </ContextMenu.Item>
      {#if can_copy_block_link}
        <ContextMenu.Item
          onSelect={() => handle_copy_block(ACTION_IDS.note_copy_block_link)}
        >
          Copy Block Link
        </ContextMenu.Item>
        <ContextMenu.Item
          onSelect={() => handle_copy_block(ACTION_IDS.note_copy_block_id)}
        >
          Copy Block ID
        </ContextMenu.Item>
      {/if}
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={() => handle_insert("above")}>
        Insert Above
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => handle_insert("below")}>
        Insert Below
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
