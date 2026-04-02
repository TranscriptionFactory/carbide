<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import { to_transform_action_id } from "$lib/features/markdown_lsp";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();

  const { stores, action_registry } = use_app_context();

  const is_iwe = $derived(
    stores.ui.editor_settings.markdown_lsp_provider === "iwes" &&
      stores.markdown_lsp.status === "running",
  );

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
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="w-full h-full">
    {@render children()}
  </ContextMenu.Trigger>
  <ContextMenu.Portal>
    <ContextMenu.Content>
      {#if is_iwe}
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
