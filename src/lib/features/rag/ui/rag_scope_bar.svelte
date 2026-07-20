<script lang="ts">
  import { FolderTree, Hash, Layers, X } from "@lucide/svelte";
  import type { TagInfo } from "$lib/features/tags";
  import type { SavedViewInfo } from "$lib/features/bases";
  import type { RagScope } from "$lib/features/rag/domain/rag_types";
  import {
    build_scope_suggestions,
    type ScopeKind,
    type ScopeSuggestion,
  } from "$lib/features/rag/domain/rag_scope_suggest";

  type Props = {
    scope: RagScope;
    folder_paths: string[];
    tags: TagInfo[];
    saved_views: SavedViewInfo[];
    on_scope_change: (scope: RagScope) => void;
  };

  let { scope, folder_paths, tags, saved_views, on_scope_change }: Props =
    $props();

  let query = $state("");
  let show_dropdown = $state(false);
  let selected_index = $state(0);

  const SCOPE_KEY: Record<ScopeKind, "folders" | "tags" | "bases"> = {
    folder: "folders",
    tag: "tags",
    base: "bases",
  };

  const view_name_by_path = $derived(
    new Map(saved_views.map((view) => [view.path, view.name])),
  );

  type Chip = { kind: ScopeKind; value: string; label: string };
  const chips = $derived<Chip[]>([
    ...(scope.folders ?? []).map((value) => ({
      kind: "folder" as const,
      value,
      label: value || "(vault root)",
    })),
    ...(scope.tags ?? []).map((value) => ({
      kind: "tag" as const,
      value,
      label: `#${value}`,
    })),
    ...(scope.bases ?? []).map((value) => ({
      kind: "base" as const,
      value,
      label: view_name_by_path.get(value) ?? value,
    })),
  ]);

  type Entry = { item: ScopeSuggestion; section: string | undefined };
  const entries = $derived<Entry[]>(
    (() => {
      const groups = build_scope_suggestions(
        query,
        { folder_paths, tags, saved_views },
        scope,
      );
      const titles: Record<ScopeKind, string> = {
        folder: "Folders",
        tag: "Tags",
        base: "Bases",
      };
      return [groups.folders, groups.tags, groups.bases].flatMap((items) =>
        items.map((item, i) => ({
          item,
          section: i === 0 ? titles[item.kind] : undefined,
        })),
      );
    })(),
  );
  const flat = $derived(entries.map((entry) => entry.item));

  function add(item: ScopeSuggestion) {
    const key = SCOPE_KEY[item.kind];
    const current = scope[key] ?? [];
    if (!current.includes(item.value)) {
      on_scope_change({ ...scope, [key]: [...current, item.value] });
    }
    query = "";
    selected_index = 0;
    show_dropdown = false;
  }

  function remove(kind: ScopeKind, value: string) {
    const key = SCOPE_KEY[kind];
    const next = (scope[key] ?? []).filter((v) => v !== value);
    on_scope_change({ ...scope, [key]: next });
  }

  function on_input(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    show_dropdown = true;
    selected_index = 0;
  }

  function on_keydown(event: KeyboardEvent) {
    if (!show_dropdown) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selected_index = Math.min(selected_index + 1, flat.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selected_index = Math.max(selected_index - 1, 0);
    } else if (event.key === "Enter") {
      if (flat.length > 0) {
        event.preventDefault();
        const item = flat[selected_index];
        if (item) add(item);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      show_dropdown = false;
    }
  }

  function on_blur() {
    setTimeout(() => {
      show_dropdown = false;
    }, 150);
  }
</script>

{#snippet kind_icon(kind: ScopeKind)}
  {#if kind === "folder"}
    <FolderTree class="size-3" />
  {:else if kind === "tag"}
    <Hash class="size-3" />
  {:else}
    <Layers class="size-3" />
  {/if}
{/snippet}

{#snippet suggestion_item(item: ScopeSuggestion, index: number)}
  <button
    type="button"
    class="ScopeBar__item"
    class:ScopeBar__item--selected={index === selected_index}
    onmousedown={(event) => {
      event.preventDefault();
      add(item);
    }}
  >
    {@render kind_icon(item.kind)}
    <span class="ScopeBar__item-label">{item.label}</span>
    {#if item.hint}
      <span class="ScopeBar__item-hint">{item.hint}</span>
    {/if}
  </button>
{/snippet}

<div class="ScopeBar">
  {#if chips.length > 0}
    <div class="ScopeBar__chips">
      {#each chips as chip (chip.kind + chip.value)}
        <span class="ScopeBar__chip">
          {@render kind_icon(chip.kind)}
          <span class="ScopeBar__chip-label">{chip.label}</span>
          <button
            type="button"
            class="ScopeBar__chip-remove"
            aria-label="Remove scope"
            onclick={() => remove(chip.kind, chip.value)}
          >
            <X class="size-3" />
          </button>
        </span>
      {/each}
    </div>
  {/if}

  <div class="ScopeBar__field">
    <input
      class="ScopeBar__input"
      type="text"
      value={query}
      placeholder="+ Add scope…"
      oninput={on_input}
      onkeydown={on_keydown}
      onfocus={() => (show_dropdown = true)}
      onblur={on_blur}
    />
    {#if show_dropdown && flat.length > 0}
      <div class="ScopeBar__dropdown">
        {#each entries as entry, index (entry.item.kind + entry.item.value)}
          {#if entry.section}
            <div class="ScopeBar__section">{entry.section}</div>
          {/if}
          {@render suggestion_item(entry.item, index)}
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .ScopeBar {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .ScopeBar__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .ScopeBar__chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.25rem 0.125rem 0.375rem;
    border-radius: calc(var(--radius) - 4px);
    background: var(--accent);
    color: var(--accent-foreground);
    font-size: 0.75rem;
    max-width: 100%;
  }

  .ScopeBar__chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ScopeBar__chip-remove {
    all: unset;
    cursor: pointer; /* all:unset beats the global :where() cursor rule */
    display: inline-flex;
    align-items: center;
    color: var(--muted-foreground);
  }

  .ScopeBar__chip-remove:hover {
    color: var(--foreground);
  }

  .ScopeBar__field {
    position: relative;
    width: 100%;
  }

  .ScopeBar__input {
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--foreground);
    height: 2rem;
    width: 100%;
    min-width: 0;
    border-radius: calc(var(--radius) - 2px);
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    outline: none;
    transition:
      color 0.15s,
      box-shadow 0.15s;
    box-shadow: var(--shadow-1);
  }

  .ScopeBar__input::placeholder {
    color: var(--muted-foreground);
  }

  .ScopeBar__input:focus-visible {
    border-color: var(--ring);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent),
      var(--shadow-1);
  }

  .ScopeBar__dropdown {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--popover);
    color: var(--popover-foreground);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) - 2px);
    box-shadow:
      0 4px 6px -1px rgb(0 0 0 / 0.1),
      0 2px 4px -2px rgb(0 0 0 / 0.1);
    max-height: calc(10 * 2rem);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 0.25rem;
  }

  .ScopeBar__section {
    padding: 0.25rem 0.5rem;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
  }

  .ScopeBar__item {
    all: unset;
    cursor: pointer; /* all:unset beats the global :where() cursor rule */
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.8125rem;
    border-radius: calc(var(--radius) - 4px);
  }

  .ScopeBar__item-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ScopeBar__item-hint {
    color: var(--muted-foreground);
    font-size: 0.6875rem;
  }

  .ScopeBar__item:hover,
  .ScopeBar__item--selected {
    background: var(--accent);
    color: var(--accent-foreground);
  }
</style>
