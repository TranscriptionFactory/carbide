<script lang="ts">
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Plus from "@lucide/svelte/icons/plus";
  import Table from "@lucide/svelte/icons/table";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import type { SavedViewInfo } from "../ports";

  const { stores, action_registry } = use_app_context();

  let expanded = $state(true);

  const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const NAMED_COLORS = new Set([
    "red",
    "orange",
    "yellow",
    "green",
    "teal",
    "blue",
    "indigo",
    "purple",
    "pink",
    "brown",
    "gray",
    "grey",
  ]);

  function sanitize_color(value: string | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (HEX_COLOR.test(trimmed)) return trimmed;
    return NAMED_COLORS.has(trimmed.toLowerCase())
      ? trimmed.toLowerCase()
      : null;
  }

  function sanitize_icon(value: string | undefined): string | null {
    if (!value) return null;
    const collapsed = value.trim().replace(/\s+/g, "");
    return collapsed ? [...collapsed].slice(0, 4).join("") : null;
  }

  function open_view(view: SavedViewInfo) {
    void action_registry.execute(ACTION_IDS.bases_load_view, view.path);
    stores.ui.set_sidebar_view("bases");
  }

  function create_view() {
    stores.ui.set_sidebar_view("bases");
  }

  function delete_view(view: SavedViewInfo) {
    void action_registry.execute(ACTION_IDS.bases_delete_view, view.path);
  }
</script>

<div class="flex flex-col">
  <div
    class="flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
  >
    <button
      type="button"
      class="flex items-center gap-1 flex-1 text-left hover:text-foreground transition-colors"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <ChevronRight
        size={12}
        class="transition-transform {expanded ? 'rotate-90' : ''}"
      />
      <span>Views</span>
    </button>
    <button
      type="button"
      class="p-0.5 rounded text-zinc-500 hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-900"
      title="New view"
      aria-label="New view"
      onclick={create_view}
    >
      <Plus size={12} />
    </button>
  </div>

  {#if expanded}
    <div class="px-1 pb-1 space-y-0.5">
      {#if stores.bases.saved_views.length === 0}
        <div class="px-2 py-2 space-y-1">
          <p class="text-xs text-zinc-500">No bases views created yet.</p>
          <button
            type="button"
            class="text-xs text-blue-500 hover:text-blue-600"
            onclick={create_view}
          >
            Create a view
          </button>
        </div>
      {:else}
        {#each stores.bases.saved_views as view (view.path)}
          {@const icon = sanitize_icon(view.icon)}
          {@const color = sanitize_color(view.color)}
          {@const count = stores.bases_counts.get(view.path)}
          <ContextMenu.Root>
            <ContextMenu.Trigger class="w-full">
              <button
                type="button"
                class="w-full flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900"
                onclick={() => open_view(view)}
              >
                <span
                  class="shrink-0 flex items-center justify-center w-4 h-4 text-[11px]"
                  style={color ? `color: ${color}` : undefined}
                  aria-hidden="true"
                >
                  {#if icon}
                    {icon}
                  {:else}
                    <Table size={13} />
                  {/if}
                </span>
                <span class="flex-1 truncate">{view.name}</span>
                {#if count !== undefined}
                  <span
                    class="shrink-0 text-[10px] tabular-nums text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900"
                  >
                    {count}
                  </span>
                {/if}
              </button>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content>
                <ContextMenu.Item onSelect={() => open_view(view)}>
                  Edit
                </ContextMenu.Item>
                <ContextMenu.Separator />
                <ContextMenu.Item onSelect={() => delete_view(view)}>
                  Delete
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        {/each}
      {/if}
    </div>
  {/if}
</div>
