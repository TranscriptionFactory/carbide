<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { onMount } from "svelte";
  import Tag from "@lucide/svelte/icons/hash";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Search from "@lucide/svelte/icons/search";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { ACTION_IDS } from "$lib/app";
  import TagTreeNode from "./tag_tree_node.svelte";
  import { build_tag_tree, filter_tag_tree } from "../domain/build_tag_tree";

  const { stores, action_registry } = use_app_context();
  const tag_store = stores.tag;

  let tag_tree = $derived(build_tag_tree(tag_store.tags));

  let filtered_tree = $derived(
    tag_store.search_query
      ? filter_tag_tree(tag_tree, tag_store.search_query)
      : tag_tree,
  );

  onMount(() => {
    void action_registry.execute(ACTION_IDS.tags_refresh);
  });
</script>

<div class="flex flex-col h-full min-w-0 bg-background border-r">
  <div class="p-3 border-b flex flex-col gap-2 min-w-0">
    <div class="flex items-center justify-between min-w-0 gap-2">
      <h2
        class="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"
      >
        <Tag size={14} />
        Tags
      </h2>
      <Button
        variant="ghost"
        size="icon"
        class="h-6 w-6"
        onclick={() => void action_registry.execute(ACTION_IDS.tags_refresh)}
        disabled={tag_store.loading}
      >
        <RefreshCw size={14} class={tag_store.loading ? "animate-spin" : ""} />
      </Button>
    </div>

    <div class="relative">
      <Search
        class="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground"
      />
      <Input
        placeholder="Search tags..."
        class="h-8 pl-8 text-xs"
        value={tag_store.search_query}
        oninput={(e) =>
          void action_registry.execute(
            ACTION_IDS.tags_set_search_query,
            e.currentTarget.value,
          )}
      />
    </div>
  </div>

  <div class="flex-1 overflow-hidden">
    {#if tag_store.selected_tag}
      <div class="flex flex-col h-full">
        <div class="flex items-center gap-1 px-2 py-1.5 border-b">
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            onclick={() => {
              void action_registry.execute(ACTION_IDS.tags_select, null);
            }}
          >
            <ChevronLeft size={14} />
          </Button>
          <span class="text-xs font-medium truncate">
            #{tag_store.selected_tag}{tag_store.selected_is_prefix
              ? "/..."
              : ""}
          </span>
        </div>

        {#if tag_store.notes_loading}
          <div
            class="flex items-center justify-center h-20 text-xs text-muted-foreground"
          >
            Loading notes...
          </div>
        {:else if tag_store.notes_for_tag.length === 0}
          <div
            class="flex items-center justify-center h-20 text-xs text-muted-foreground"
          >
            No notes with this tag.
          </div>
        {:else}
          <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
            {#each tag_store.notes_for_tag as note_path (note_path)}
              <button
                type="button"
                class="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted truncate"
                onclick={() =>
                  void action_registry.execute(
                    ACTION_IDS.tags_open_note,
                    note_path,
                  )}
              >
                {note_path}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else if tag_store.loading && tag_store.tags.length === 0}
      <div
        class="flex items-center justify-center h-20 text-xs text-muted-foreground"
      >
        Loading tags...
      </div>
    {:else if filtered_tree.length === 0}
      <div
        class="flex flex-col items-center justify-center h-40 text-xs text-muted-foreground gap-2"
      >
        <p>{tag_store.search_query ? "No matching tags." : "No tags found."}</p>
        {#if tag_store.search_query}
          <Button
            variant="link"
            size="sm"
            class="h-auto p-0 text-[10px]"
            onclick={() =>
              void action_registry.execute(
                ACTION_IDS.tags_set_search_query,
                "",
              )}
          >
            Clear search
          </Button>
        {/if}
      </div>
    {:else}
      <div class="flex-1 overflow-y-auto py-1 flex flex-col">
        {#each filtered_tree as node (node.full_tag)}
          <TagTreeNode {node} depth={0} {tag_store} {action_registry} />
        {/each}
      </div>
    {/if}
  </div>

  {#if tag_store.error}
    <div class="p-2 bg-destructive/10 text-destructive text-[10px] border-t">
      {tag_store.error}
    </div>
  {/if}
</div>
