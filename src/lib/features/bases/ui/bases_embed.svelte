<script lang="ts">
  import type { BasesStore } from "../state/bases_store.svelte";
  import {
    VIEW_MODES,
    type KanbanConfig,
    type CalendarConfig,
    type TreeConfig,
    type ViewMode,
  } from "../ports";
  import BasesTable from "./bases_table.svelte";
  import BasesKanban from "./bases_kanban.svelte";
  import BasesGallery from "./bases_gallery.svelte";
  import BasesCalendar from "./bases_calendar.svelte";
  import BasesTree from "./bases_tree.svelte";

  let {
    store,
    on_note_click,
    on_config_change,
  }: {
    store: BasesStore;
    on_note_click: (path: string) => void;
    on_config_change?: () => void;
  } = $props();

  function update_view_mode(mode: ViewMode) {
    if (store.active_view_mode === mode) return;
    store.active_view_mode = mode;
    on_config_change?.();
  }

  function update_kanban(config: KanbanConfig) {
    store.kanban_config = config;
    on_config_change?.();
  }

  function update_calendar(config: CalendarConfig) {
    store.calendar_config = config;
    on_config_change?.();
  }

  function update_tree(config: TreeConfig | null) {
    store.tree_config = config;
    on_config_change?.();
  }
</script>

{#if !store.error}
  <div class="smart-block-view-switcher" role="group" aria-label="View mode">
    {#each VIEW_MODES as mode}
      <button
        type="button"
        class="smart-block-view-btn"
        class:active={store.active_view_mode === mode}
        aria-pressed={store.active_view_mode === mode}
        onclick={() => update_view_mode(mode)}
      >
        {mode}
      </button>
    {/each}
  </div>
{/if}

{#if store.error}
  <div class="smart-block-error">{store.error}</div>
{:else if store.loading && store.result_set.length === 0}
  <div class="smart-block-loading">Running…</div>
{:else if store.result_set.length === 0}
  <div class="smart-block-empty">No results</div>
{:else if store.active_view_mode === "kanban"}
  <BasesKanban
    rows={store.result_set}
    config={store.kanban_config}
    available_properties={store.available_properties}
    {on_note_click}
    on_config_change={update_kanban}
  />
{:else if store.active_view_mode === "gallery"}
  <BasesGallery rows={store.result_set} {on_note_click} />
{:else if store.active_view_mode === "calendar"}
  <BasesCalendar
    rows={store.result_set}
    config={store.calendar_config}
    available_properties={store.available_properties}
    {on_note_click}
    on_config_change={update_calendar}
  />
{:else if store.active_view_mode === "tree"}
  <BasesTree
    rows={store.result_set}
    config={store.tree_config}
    available_properties={store.available_properties}
    {on_note_click}
    on_config_change={update_tree}
  />
{:else if store.active_view_mode === "list"}
  <div class="smart-block-base-list">
    {#each store.result_set as row}
      <button
        type="button"
        class="smart-block-base-list-item"
        onclick={() => on_note_click(row.note.path)}
      >
        <span class="smart-block-title">{row.note.title || row.note.name}</span>
        <span class="smart-block-path">{row.note.path}</span>
      </button>
    {/each}
  </div>
{:else}
  <BasesTable rows={store.result_set} {on_note_click} />
{/if}

{#if store.result_set.length > 0 && store.total_count > store.result_set.length}
  <div class="smart-block-truncation">
    Showing {store.result_set.length} of {store.total_count}
  </div>
{/if}
