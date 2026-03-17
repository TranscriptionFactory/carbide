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

  const { stores, action_registry } = use_app_context();
  const tag_store = stores.tag;

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
          <span class="text-xs font-medium truncate"
            >#{tag_store.selected_tag}</span
          >
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
    {:else if tag_store.filtered_tags.length === 0}
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
      <div class="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
        {#each tag_store.filtered_tags as tag_info (tag_info.tag)}
          <button
            type="button"
            class="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center justify-between gap-2"
            onclick={() =>
              void action_registry.execute(
                ACTION_IDS.tags_select,
                tag_info.tag,
              )}
          >
            <span class="truncate">#{tag_info.tag}</span>
            <span
              class="shrink-0 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full"
            >
              {tag_info.count}
            </span>
          </button>
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
