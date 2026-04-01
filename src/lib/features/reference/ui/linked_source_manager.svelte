<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import {
    FolderPlus,
    RefreshCw,
    Trash2,
    ToggleLeft,
    ToggleRight,
    AlertCircle,
    Loader2,
    FolderOpen,
  } from "@lucide/svelte";

  const ctx = use_app_context();
  const ref_store = ctx.stores.reference;
  const ref_service = ctx.services.reference;

  let item_counts = $state<Record<string, number>>({});

  async function refresh_counts() {
    const sources = ref_store.linked_sources;
    const results = await Promise.allSettled(
      sources.map((s) => ref_service.count_linked_notes_for_source(s.name)),
    );
    const next: Record<string, number> = {};
    for (let i = 0; i < sources.length; i++) {
      const r = results[i]!;
      next[sources[i]!.id] = r.status === "fulfilled" ? r.value : 0;
    }
    item_counts = next;
  }

  $effect(() => {
    if (ref_store.linked_sources.length > 0) {
      void refresh_counts();
    }
  });

  async function add_source() {
    await ctx.action_registry.execute("reference.add_linked_source");
  }

  async function remove_source(id: string) {
    await ctx.action_registry.execute("reference.remove_linked_source", {
      id,
      remove_references: true,
    });
  }

  async function toggle_source(id: string) {
    await ctx.action_registry.execute("reference.toggle_linked_source", id);
  }

  async function rescan_source(id: string) {
    await ctx.action_registry.execute("reference.scan_linked_source", id);
  }

  function get_item_count(source_id: string): number {
    return item_counts[source_id] ?? 0;
  }

  function get_sync_status(source_id: string): "idle" | "scanning" | "error" {
    return ref_store.linked_source_sync_status[source_id] ?? "idle";
  }
</script>

<div class="LinkedSourceManager">
  <div class="flex items-center justify-between px-3 py-2 border-b">
    <p class="text-xs text-muted-foreground font-medium">Linked Sources</p>
    <button
      class="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs hover:bg-muted"
      onclick={add_source}
      title="Add linked source folder"
    >
      <FolderPlus class="w-3.5 h-3.5" />
    </button>
  </div>

  {#if ref_store.linked_sources.length === 0}
    <div class="text-center py-4 px-4 text-muted-foreground">
      <FolderOpen class="w-6 h-6 mx-auto mb-1.5 opacity-50" />
      <p class="text-xs">No linked folders.</p>
      <p class="text-xs mt-0.5 opacity-75">
        Link a folder of PDFs or HTML files to auto-index them.
      </p>
    </div>
  {:else}
    {#each ref_store.linked_sources as source (source.id)}
      {@const status = get_sync_status(source.id)}
      {@const count = get_item_count(source.id)}
      <div
        class="px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 min-w-0 flex-1">
            {#if status === "scanning"}
              <Loader2 class="w-3 h-3 animate-spin text-muted-foreground" />
            {:else if status === "error"}
              <AlertCircle class="w-3 h-3 text-destructive" />
            {/if}
            <span
              class="text-sm font-medium truncate"
              class:opacity-50={!source.enabled}
            >
              {source.name}
            </span>
          </div>
          <span class="text-xs text-muted-foreground ml-2 shrink-0">
            {count}
          </span>
        </div>
        <div class="text-xs text-muted-foreground truncate mt-0.5">
          {source.path}
        </div>
        <div class="flex items-center gap-1 mt-1.5">
          <button
            class="p-0.5 rounded hover:bg-muted"
            onclick={() => toggle_source(source.id)}
            title={source.enabled ? "Disable" : "Enable"}
          >
            {#if source.enabled}
              <ToggleRight class="w-3.5 h-3.5 text-green-500" />
            {:else}
              <ToggleLeft class="w-3.5 h-3.5 text-muted-foreground" />
            {/if}
          </button>
          <button
            class="p-0.5 rounded hover:bg-muted"
            onclick={() => rescan_source(source.id)}
            title="Rescan"
            disabled={!source.enabled || status === "scanning"}
          >
            <RefreshCw
              class="w-3.5 h-3.5 text-muted-foreground {status === 'scanning'
                ? 'animate-spin'
                : ''}"
            />
          </button>
          <button
            class="p-0.5 rounded hover:bg-muted"
            onclick={() => remove_source(source.id)}
            title="Remove"
          >
            <Trash2 class="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .LinkedSourceManager {
    border-top: 1px solid var(--border);
  }
</style>
