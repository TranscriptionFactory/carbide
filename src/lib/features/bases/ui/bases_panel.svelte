<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import Table from "@lucide/svelte/icons/table";
  import List from "@lucide/svelte/icons/list";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import Filter from "@lucide/svelte/icons/filter";
  import Save from "@lucide/svelte/icons/save";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import BasesTable from "./bases_table.svelte";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";

  const OPERATORS = [
    { value: "eq", label: "=" },
    { value: "neq", label: "!=" },
    { value: "contains", label: "contains" },
    { value: "matches", label: "matches" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "gte", label: ">=" },
    { value: "lte", label: "<=" },
  ];

  const BUILT_IN_PROPERTIES = [
    { name: "content", property_type: "fts", count: 0, unique_values: null },
    { name: "title", property_type: "string", count: 0, unique_values: null },
    { name: "path", property_type: "string", count: 0, unique_values: null },
    { name: "tag", property_type: "string", count: 0, unique_values: null },
  ];

  const { stores, services, action_registry } = use_app_context();
  const bases_store = stores.bases;
  const vault_store = stores.vault;

  let filters_open = $state(false);
  let draft_property = $state("");
  let draft_operator = $state("eq");
  let draft_value = $state("");
  let views_open = $state(false);
  let save_name = $state("");
  let saving = $state(false);

  function refresh() {
    const vault_id = vault_store.active_vault_id;
    if (vault_id) {
      void services.bases.refresh_properties(vault_id);
      void services.bases.run_query(vault_id);
    }
  }

  function toggle_views() {
    views_open = !views_open;
    if (views_open) {
      void action_registry.execute(ACTION_IDS.bases_list_views);
    }
  }

  async function save_view() {
    const name = save_name.trim();
    if (!name) return;
    saving = true;
    await action_registry.execute(ACTION_IDS.bases_save_view, name);
    save_name = "";
    saving = false;
  }

  function load_view(path: string) {
    void action_registry.execute(ACTION_IDS.bases_load_view, path);
    views_open = false;
  }

  function delete_view(path: string) {
    void action_registry.execute(ACTION_IDS.bases_delete_view, path);
  }

  function handle_note_click(path: string) {
    void action_registry.execute(ACTION_IDS.note_open, { note_path: path });
  }

  function add_filter() {
    if (!draft_property) return;
    bases_store.add_filter({
      property: draft_property,
      operator: draft_operator,
      value: draft_value,
    });
    draft_value = "";
    run_query();
  }

  function remove_filter(index: number) {
    bases_store.remove_filter(index);
    run_query();
  }

  function clear_filters() {
    bases_store.clear_filters();
    run_query();
  }

  function toggle_sort(property: string) {
    const current = bases_store.query.sort[0];
    if (current?.property === property) {
      if (current.descending) {
        bases_store.set_sort(null);
      } else {
        bases_store.set_sort({ property, descending: true });
      }
    } else {
      bases_store.set_sort({ property, descending: false });
    }
    run_query();
  }

  function run_query() {
    const vault_id = vault_store.active_vault_id;
    if (vault_id) {
      void services.bases.run_query(vault_id);
    }
  }

  const active_sort = $derived(bases_store.query.sort[0] ?? null);
  const has_filters = $derived(bases_store.query.filters.length > 0);
</script>

<div class="h-full flex flex-col bg-white dark:bg-zinc-950">
  <div
    class="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800"
  >
    <div class="flex items-center gap-3">
      <h2 class="text-sm font-semibold">
        Bases{#if bases_store.active_view_name}<span
            class="font-normal text-zinc-500"
          >
            — {bases_store.active_view_name}</span
          >{/if}
      </h2>
      <div
        class="flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-md p-0.5"
      >
        <button
          class="p-1 rounded {bases_store.active_view_mode === 'table'
            ? 'bg-white dark:bg-zinc-800 shadow-sm'
            : ''}"
          onclick={() => (bases_store.active_view_mode = "table")}
        >
          <Table size={14} />
        </button>
        <button
          class="p-1 rounded {bases_store.active_view_mode === 'list'
            ? 'bg-white dark:bg-zinc-800 shadow-sm'
            : ''}"
          onclick={() => (bases_store.active_view_mode = "list")}
        >
          <List size={14} />
        </button>
      </div>
    </div>
    <div class="flex items-center gap-1">
      <button
        class="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors {views_open
          ? 'text-blue-500'
          : ''}"
        onclick={toggle_views}
        aria-label="Saved views"
        title="Saved views"
      >
        <FolderOpen size={14} />
      </button>
      <button
        class="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors {filters_open ||
        has_filters
          ? 'text-blue-500'
          : ''}"
        onclick={() => (filters_open = !filters_open)}
        aria-label="Toggle filters"
      >
        <Filter size={14} />
      </button>
      <button
        class="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors"
        onclick={refresh}
        disabled={bases_store.loading}
      >
        <RefreshCw
          size={14}
          class={bases_store.loading ? "animate-spin" : ""}
        />
      </button>
    </div>
  </div>

  {#if views_open}
    <div
      class="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/30"
    >
      <div class="flex items-end gap-2">
        <div class="flex-1 min-w-0">
          <label
            for="save-view-name"
            class="block text-[10px] text-zinc-500 mb-0.5"
            >Save current view</label
          >
          <input
            id="save-view-name"
            type="text"
            bind:value={save_name}
            placeholder="View name..."
            class="w-full text-xs px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md"
            onkeydown={(e) => e.key === "Enter" && save_view()}
          />
        </div>
        <button
          class="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-md disabled:opacity-50"
          disabled={!save_name.trim() || saving}
          onclick={save_view}
          title="Save view"
        >
          <Save size={14} />
        </button>
      </div>

      {#if bases_store.saved_views.length > 0}
        <div class="space-y-1">
          <span class="text-[10px] text-zinc-500">Saved views</span>
          {#each bases_store.saved_views as view}
            <div class="flex items-center gap-2 text-xs">
              <button
                type="button"
                class="flex-1 text-left px-2 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 truncate {bases_store.active_view_name ===
                view.name
                  ? 'ring-1 ring-blue-500'
                  : ''}"
                onclick={() => load_view(view.path)}
              >
                {view.name}
              </button>
              <button
                class="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-zinc-400 hover:text-red-500"
                onclick={() => delete_view(view.path)}
                title="Delete view"
              >
                <Trash2 size={12} />
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <div class="text-xs text-zinc-500">No saved views yet.</div>
      {/if}
    </div>
  {/if}

  {#if filters_open}
    <div
      class="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/30"
    >
      {#if bases_store.query.filters.length > 0}
        <div class="space-y-1.5">
          {#each bases_store.query.filters as filter, i}
            <div class="flex items-center gap-2 text-xs">
              <span
                class="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded font-medium truncate max-w-[120px]"
                >{filter.property}</span
              >
              <span class="text-zinc-500"
                >{OPERATORS.find((o) => o.value === filter.operator)?.label ??
                  filter.operator}</span
              >
              <span
                class="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded truncate max-w-[120px]"
                >{filter.value || '""'}</span
              >
              <button
                class="p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
                onclick={() => remove_filter(i)}
              >
                <X size={12} />
              </button>
            </div>
          {/each}
          <button
            class="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            onclick={clear_filters}
          >
            Clear all
          </button>
        </div>
      {/if}

      <div class="flex items-end gap-2">
        <div class="flex-1 min-w-0">
          <label
            for="filter-property"
            class="block text-[10px] text-zinc-500 mb-0.5">Property</label
          >
          <select
            id="filter-property"
            bind:value={draft_property}
            class="w-full text-xs px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md"
          >
            <option value="">Select...</option>
            {#each BUILT_IN_PROPERTIES as prop}
              <option value={prop.name}>{prop.name}</option>
            {/each}
            {#if bases_store.available_properties.length > 0}
              <option disabled>───</option>
            {/if}
            {#each bases_store.available_properties as prop}
              <option value={prop.name}>{prop.name} ({prop.count})</option>
            {/each}
          </select>
        </div>
        <div class="w-20">
          <label
            for="filter-operator"
            class="block text-[10px] text-zinc-500 mb-0.5">Op</label
          >
          <select
            id="filter-operator"
            bind:value={draft_operator}
            class="w-full text-xs px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md"
          >
            {#each OPERATORS as op}
              <option value={op.value}>{op.label}</option>
            {/each}
          </select>
        </div>
        <div class="flex-1 min-w-0">
          <label
            for="filter-value"
            class="block text-[10px] text-zinc-500 mb-0.5">Value</label
          >
          <input
            id="filter-value"
            type="text"
            bind:value={draft_value}
            placeholder="value"
            class="w-full text-xs px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md"
            onkeydown={(e) => e.key === "Enter" && add_filter()}
          />
        </div>
        <button
          class="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-md disabled:opacity-50"
          disabled={!draft_property}
          onclick={add_filter}
        >
          <Plus size={14} />
        </button>
      </div>

      <div class="flex items-center gap-2">
        <ArrowUpDown size={12} class="text-zinc-400" />
        <select
          class="text-xs px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md"
          value={active_sort?.property ?? ""}
          onchange={(e) => {
            const val = (e.target as HTMLSelectElement).value;
            if (val) {
              bases_store.set_sort({
                property: val,
                descending: active_sort?.descending ?? false,
              });
              run_query();
            } else {
              bases_store.set_sort(null);
              run_query();
            }
          }}
        >
          <option value="">No sort</option>
          <option value="title">Title</option>
          <option value="mtime_ms">Modified</option>
          {#each bases_store.available_properties as prop}
            <option value={prop.name}>{prop.name}</option>
          {/each}
        </select>
        {#if active_sort}
          <button
            class="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700"
            onclick={() => {
              if (active_sort) {
                bases_store.set_sort({
                  property: active_sort.property,
                  descending: !active_sort.descending,
                });
                run_query();
              }
            }}
          >
            {active_sort.descending ? "DESC" : "ASC"}
          </button>
        {/if}
      </div>
    </div>
  {/if}

  {#if has_filters && !filters_open}
    <div
      class="px-4 py-1.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2"
    >
      <Filter size={12} class="text-blue-500" />
      <span class="text-[11px] text-zinc-500"
        >{bases_store.query.filters.length} filter{bases_store.query.filters
          .length > 1
          ? "s"
          : ""} active</span
      >
      <button
        class="text-[11px] text-blue-500 hover:text-blue-600"
        onclick={() => (filters_open = true)}>Edit</button
      >
    </div>
  {/if}

  <div class="flex-1 overflow-auto">
    {#if bases_store.loading && bases_store.result_set.length === 0}
      <div class="h-full flex items-center justify-center text-zinc-500">
        <RefreshCw size={24} class="animate-spin" />
      </div>
    {:else if bases_store.error}
      <div
        class="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-sm m-4 border border-red-100 dark:border-red-900/30"
      >
        {bases_store.error}
      </div>
    {:else if bases_store.result_set.length === 0}
      <div
        class="h-full flex items-center justify-center text-zinc-500 text-sm"
      >
        No results found.
      </div>
    {:else if bases_store.active_view_mode === "table"}
      <BasesTable
        rows={bases_store.result_set}
        on_note_click={handle_note_click}
        {active_sort}
        on_sort_toggle={toggle_sort}
      />
    {:else}
      <div class="p-4 space-y-4">
        {#each bases_store.result_set as row}
          <button
            type="button"
            class="w-full text-left p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-pointer bg-white dark:bg-zinc-900/30"
            onclick={() => handle_note_click(row.note.path)}
          >
            <div class="flex items-start justify-between mb-2">
              <h3 class="text-sm font-medium">
                {row.note.title || row.note.name}
              </h3>
              <span class="text-[10px] text-zinc-400 tabular-nums"
                >{row.note.path}</span
              >
            </div>

            <div class="flex flex-wrap gap-2 mb-2">
              {#each row.tags as tag}
                <span
                  class="px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-[10px] text-zinc-600 dark:text-zinc-400"
                >
                  #{tag}
                </span>
              {/each}
            </div>

            <div class="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
              {#each Object.entries(row.properties) as [key, prop]}
                <div class="flex items-center gap-2 text-[11px]">
                  <span class="text-zinc-500 truncate">{key}:</span>
                  <span
                    class="text-zinc-700 dark:text-zinc-300 truncate font-medium"
                    >{prop.value}</span
                  >
                </div>
              {/each}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if bases_store.total_count > bases_store.query.limit}
    <div
      class="flex items-center justify-between px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500"
    >
      <span
        >{bases_store.query.offset + 1}–{Math.min(
          bases_store.query.offset + bases_store.query.limit,
          bases_store.total_count,
        )} of {bases_store.total_count}</span
      >
      <div class="flex items-center gap-2">
        <button
          class="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
          disabled={bases_store.query.offset === 0}
          onclick={() => {
            bases_store.query = {
              ...bases_store.query,
              offset: Math.max(
                0,
                bases_store.query.offset - bases_store.query.limit,
              ),
            };
            run_query();
          }}>Prev</button
        >
        <button
          class="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
          disabled={bases_store.query.offset + bases_store.query.limit >=
            bases_store.total_count}
          onclick={() => {
            bases_store.query = {
              ...bases_store.query,
              offset: bases_store.query.offset + bases_store.query.limit,
            };
            run_query();
          }}>Next</button
        >
      </div>
    </div>
  {/if}
</div>
