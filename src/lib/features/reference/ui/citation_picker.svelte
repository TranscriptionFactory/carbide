<script lang="ts">
  import { onDestroy } from "svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Search, BookOpen, Plug, PlugZap, Link } from "@lucide/svelte";
  import { format_authors, extract_year } from "../domain/csl_utils";
  import { match_query } from "../domain/csl_utils";
  import type { CslItem, LinkedNoteInfo } from "../types";
  import LinkedSourceManager from "./linked_source_manager.svelte";

  const ctx = use_app_context();
  const ref_store = ctx.stores.reference;
  const ref_service = ctx.services.reference;

  let query = $state("");
  let debounce_timer: ReturnType<typeof setTimeout> | null = null;
  let local_results = $state<CslItem[]>([]);
  let linked_results = $state<LinkedNoteInfo[]>([]);
  let extension_results = $state<Array<{ label: string; items: CslItem[] }>>(
    [],
  );
  let searching = $state(false);
  let destroyed = false;

  const has_connected_extensions = $derived(
    ref_store.get_connected_extensions().length > 0,
  );
  const has_extensions = $derived(
    ref_service.get_registered_extensions().length > 0,
  );

  function debounced_search(q: string) {
    if (debounce_timer) clearTimeout(debounce_timer);
    if (!q.trim()) {
      local_results = [];
      linked_results = [];
      extension_results = [];
      searching = false;
      return;
    }
    searching = true;
    debounce_timer = setTimeout(async () => {
      debounce_timer = null;
      if (destroyed) return;
      local_results = ref_store.library_items.filter((item) =>
        match_query(item, q),
      );
      try {
        linked_results = await ref_service.search_linked_notes(q);
      } catch {
        linked_results = [];
      }
      const local_ids = new Set(local_results.map((i) => i.id));
      const ext_groups: Array<{ label: string; items: CslItem[] }> = [];
      for (const ext of ref_service.get_registered_extensions()) {
        if (destroyed) break;
        const status = ref_store.get_extension_status(ext.id);
        if (status !== "connected") continue;
        try {
          await ctx.action_registry.execute("reference.search_extension", {
            ext_id: ext.id,
            query: q,
          });
          if (destroyed) break;
          const remote = ref_store.search_results;
          const unique = remote.filter((i) => !local_ids.has(i.id));
          if (unique.length > 0) {
            ext_groups.push({ label: ext.label, items: unique });
            for (const item of unique) local_ids.add(item.id);
          }
        } catch {
          // extension search failed, skip
        }
      }
      if (destroyed) return;
      extension_results = ext_groups;
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

  async function open_file(path: string | undefined) {
    if (!path) return;
    await ctx.action_registry.execute("document.open", { file_path: path });
  }

  function format_linked_note_line(note: LinkedNoteInfo): string {
    const parts: string[] = [];
    if (note.authors) parts.push(note.authors);
    if (note.year) parts.push(String(note.year));
    return parts.join(" · ");
  }

  function format_item_line(item: CslItem): string {
    const year = extract_year(item);
    const authors = format_authors(item.author);
    const parts: string[] = [];
    if (authors) parts.push(authors);
    if (year) parts.push(String(year));
    return parts.join(" · ");
  }

  async function test_connections() {
    for (const ext of ref_service.get_registered_extensions()) {
      await ctx.action_registry.execute(
        "reference.test_extension_connection",
        ext.id,
      );
    }
  }

  onDestroy(() => {
    if (debounce_timer) clearTimeout(debounce_timer);
    destroyed = true;
  });
</script>

<div class="CitationPicker">
  <div class="CitationPicker__header">
    <div class="flex items-center justify-between px-3 py-2 border-b">
      <h2 class="text-sm font-semibold">References</h2>
      {#if has_extensions}
        <button
          class="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs hover:bg-muted"
          onclick={test_connections}
          title={has_connected_extensions
            ? "Extensions connected"
            : "Click to test extension connections"}
        >
          {#if has_connected_extensions}
            <PlugZap class="w-3 h-3 text-green-500" />
          {:else}
            <Plug class="w-3 h-3 text-muted-foreground" />
          {/if}
        </button>
      {/if}
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

      {#if linked_results.length > 0}
        <div class="px-3 pt-2">
          <p class="text-xs text-muted-foreground font-medium mb-1">
            Linked Sources
          </p>
        </div>
        {#each linked_results as note (note.path)}
          <button
            class="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
            onclick={() => open_file(note.external_file_path)}
            title="Open linked file"
          >
            <div class="flex items-center gap-1.5">
              <Link class="w-3 h-3 text-muted-foreground shrink-0" />
              <span class="text-sm font-medium truncate">
                {note.title}
              </span>
            </div>
            <div class="text-xs text-muted-foreground truncate">
              {format_linked_note_line(note)}
            </div>
          </button>
        {/each}
      {/if}

      {#each extension_results as group (group.label)}
        <div class="px-3 pt-2">
          <p class="text-xs text-muted-foreground font-medium mb-1">
            {group.label}
          </p>
        </div>
        {#each group.items as item (item.id)}
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
      {/each}

      {#if query.trim() && local_results.length === 0 && linked_results.length === 0 && extension_results.length === 0 && !searching}
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

    <LinkedSourceManager />
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
