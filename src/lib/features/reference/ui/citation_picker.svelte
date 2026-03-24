<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Search, BookOpen, Plug, PlugZap } from "@lucide/svelte";
  import { format_authors, extract_year } from "../domain/csl_utils";
  import type { CslItem } from "../types";

  const ctx = use_app_context();
  const ref_store = ctx.stores.reference;
  const services = ctx.services;

  let query = $state("");
  let debounce_timer: ReturnType<typeof setTimeout> | null = null;
  let local_results = $state<CslItem[]>([]);
  let zotero_results = $state<CslItem[]>([]);
  let searching = $state(false);

  const is_connected = $derived(ref_store.connection_status === "connected");

  function debounced_search(q: string) {
    if (debounce_timer) clearTimeout(debounce_timer);
    if (!q.trim()) {
      local_results = [];
      zotero_results = [];
      searching = false;
      return;
    }
    searching = true;
    debounce_timer = setTimeout(async () => {
      local_results = services.reference.search_library(q);
      if (is_connected) {
        try {
          zotero_results = await services.reference.search_zotero(q);
          const local_ids = new Set(local_results.map((i) => i.id));
          zotero_results = zotero_results.filter((i) => !local_ids.has(i.id));
        } catch {
          zotero_results = [];
        }
      }
      searching = false;
    }, 250);
  }

  function on_input(e: Event) {
    query = (e.target as HTMLInputElement).value;
    debounced_search(query);
  }

  async function insert(item: CslItem) {
    await ctx.action_registry.execute("reference.insert_citation", item.id);
  }

  function format_item_line(item: CslItem): string {
    const year = extract_year(item);
    const authors = format_authors(item.author);
    const parts: string[] = [];
    if (authors) parts.push(authors);
    if (year) parts.push(String(year));
    return parts.join(" · ");
  }

  async function test_connection() {
    await services.reference.test_zotero_connection();
  }
</script>

<div class="CitationPicker">
  <div class="CitationPicker__header">
    <div class="flex items-center justify-between px-3 py-2 border-b">
      <h2 class="text-sm font-semibold">References</h2>
      <button
        class="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs hover:bg-muted"
        onclick={test_connection}
        title={is_connected
          ? "Zotero connected"
          : "Click to test Zotero connection"}
      >
        {#if is_connected}
          <PlugZap class="w-3 h-3 text-green-500" />
        {:else}
          <Plug class="w-3 h-3 text-muted-foreground" />
        {/if}
      </button>
    </div>
    <div class="relative px-3 py-2">
      <Search
        class="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
      />
      <input
        type="text"
        placeholder="Search references..."
        value={query}
        oninput={on_input}
        class="w-full pl-7 pr-2 py-1.5 text-sm rounded border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  </div>

  <div class="CitationPicker__content">
    {#if !query.trim() && ref_store.library_items.length === 0}
      <div class="text-center py-8 px-4 text-muted-foreground">
        <BookOpen class="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p class="text-sm">No references yet.</p>
        <p class="text-xs mt-1">Search to find and import references.</p>
      </div>
    {:else if searching}
      <div class="text-center py-4 text-muted-foreground">
        <p class="text-sm">Searching...</p>
      </div>
    {:else}
      {#if local_results.length > 0}
        <div class="px-3 pt-2">
          <p class="text-xs text-muted-foreground font-medium mb-1">Library</p>
        </div>
        {#each local_results as item (item.id)}
          <button
            class="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
            onclick={() => insert(item)}
            title="Insert [@{item.id}]"
          >
            <div class="text-sm font-medium truncate">
              {item.title ?? item.id}
            </div>
            <div class="text-xs text-muted-foreground truncate">
              {format_item_line(item)}
            </div>
          </button>
        {/each}
      {/if}

      {#if zotero_results.length > 0}
        <div class="px-3 pt-2">
          <p class="text-xs text-muted-foreground font-medium mb-1">Zotero</p>
        </div>
        {#each zotero_results as item (item.id)}
          <button
            class="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
            onclick={() => insert(item)}
            title="Import and insert [@{item.id}]"
          >
            <div class="text-sm font-medium truncate">
              {item.title ?? item.id}
            </div>
            <div class="text-xs text-muted-foreground truncate">
              {format_item_line(item)}
            </div>
          </button>
        {/each}
      {/if}

      {#if query.trim() && local_results.length === 0 && zotero_results.length === 0 && !searching}
        <div class="text-center py-4 text-muted-foreground">
          <p class="text-sm">No results found.</p>
        </div>
      {/if}

      {#if !query.trim() && ref_store.library_items.length > 0}
        <div class="px-3 pt-2">
          <p class="text-xs text-muted-foreground font-medium mb-1">
            Library ({ref_store.library_items.length})
          </p>
        </div>
        {#each ref_store.library_items as item (item.id)}
          <button
            class="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
            onclick={() => insert(item)}
            title="Insert [@{item.id}]"
          >
            <div class="text-sm font-medium truncate">
              {item.title ?? item.id}
            </div>
            <div class="text-xs text-muted-foreground truncate">
              {format_item_line(item)}
            </div>
          </button>
        {/each}
      {/if}
    {/if}
  </div>
</div>

<style>
  .CitationPicker {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
  }

  .CitationPicker__content {
    overflow-y: auto;
    flex: 1;
  }
</style>
