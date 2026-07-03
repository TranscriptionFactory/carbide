<script lang="ts">
  import { ChevronUp, ChevronDown, X, Plus } from "@lucide/svelte";
  import {
    SIDEBAR_VIEWS,
    resolve_sidebar_views_config,
    sidebar_view_def,
  } from "$lib/app";
  import type { SidebarViewConfigEntry } from "$lib/app";

  type Props = {
    config: SidebarViewConfigEntry[];
    on_change: (next: SidebarViewConfigEntry[]) => void;
  };

  let { config, on_change }: Props = $props();

  const resolved = $derived(resolve_sidebar_views_config(config));
  const enabled = $derived(resolved.filter((entry) => entry.visible));
  const available = $derived(resolved.filter((entry) => !entry.visible));

  function set_visible(id: string, visible: boolean) {
    on_change(
      resolved.map((entry) =>
        entry.id === id ? { ...entry, visible } : entry,
      ),
    );
  }

  function move(id: string, direction: -1 | 1) {
    const idx = resolved.findIndex((entry) => entry.id === id);
    if (idx < 0) return;
    let target = idx + direction;
    while (
      target >= 0 &&
      target < resolved.length &&
      !resolved[target]!.visible
    ) {
      target += direction;
    }
    if (target < 0 || target >= resolved.length) return;
    const next = [...resolved];
    const tmp = next[idx]!;
    next[idx] = next[target]!;
    next[target] = tmp;
    on_change(next);
  }
</script>

<div class="space-y-4">
  <div class="space-y-2">
    <span class="text-xs font-medium text-muted-foreground">Enabled</span>
    <div class="flex flex-col gap-1">
      {#each enabled as entry, i (entry.id)}
        {@const def = sidebar_view_def(entry.id)}
        {#if def}
          <div class="flex items-center gap-2 rounded-md border p-2">
            <def.icon class="size-4 shrink-0 text-muted-foreground" />
            <span class="flex-1 text-sm">{def.label}</span>
            <button
              type="button"
              class="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
              onclick={() => move(entry.id, -1)}
              disabled={i === 0}
              title="Move up"
              aria-label={`Move ${def.label} up`}
            >
              <ChevronUp class="size-4" />
            </button>
            <button
              type="button"
              class="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
              onclick={() => move(entry.id, 1)}
              disabled={i === enabled.length - 1}
              title="Move down"
              aria-label={`Move ${def.label} down`}
            >
              <ChevronDown class="size-4" />
            </button>
            <button
              type="button"
              class="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
              onclick={() => set_visible(entry.id, false)}
              disabled={entry.id === SIDEBAR_VIEWS.explorer}
              title="Hide"
              aria-label={`Hide ${def.label}`}
            >
              <X class="size-4" />
            </button>
          </div>
        {/if}
      {/each}
    </div>
  </div>

  {#if available.length > 0}
    <div class="space-y-2">
      <span class="text-xs font-medium text-muted-foreground">Available</span>
      <div class="flex flex-wrap gap-2">
        {#each available as entry (entry.id)}
          {@const def = sidebar_view_def(entry.id)}
          {#if def}
            <button
              type="button"
              class="flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
              onclick={() => set_visible(entry.id, true)}
              aria-label={`Show ${def.label}`}
            >
              <Plus class="size-3.5" />
              <def.icon class="size-4" />
              <span>{def.label}</span>
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
