<script lang="ts">
  import {
    ChevronDown,
    ChevronRight,
    Eye,
    EyeOff,
    Plus,
    Tag,
    Pencil,
    Palette,
    Trash2,
  } from "@lucide/svelte";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import type { TypeSection } from "../ports";

  type Props = {
    sections: TypeSection[];
    active_type?: string | null;
    open?: boolean;
    on_toggle?: () => void;
    on_select: (name: string) => void;
    on_create: (name: string) => void;
    on_toggle_visibility: (section: TypeSection) => void;
    on_rename: (section: TypeSection, label: string) => void;
    on_customize: (section: TypeSection) => void;
    on_delete: (section: TypeSection) => void;
  };

  let {
    sections,
    active_type = null,
    open = $bindable(true),
    on_toggle,
    on_select,
    on_create,
    on_toggle_visibility,
    on_rename,
    on_customize,
    on_delete,
  }: Props = $props();

  let renaming_path = $state<string | null>(null);
  let rename_value = $state("");
  let show_hidden = $state(false);
  let creating = $state(false);
  let create_value = $state("");

  const visible_sections = $derived(
    show_hidden ? sections : sections.filter((section) => section.visible),
  );

  function focus_on_mount(el: HTMLInputElement) {
    el.focus();
    el.select();
  }

  function toggle() {
    if (on_toggle) on_toggle();
    else open = !open;
  }

  function start_create() {
    open = true;
    creating = true;
    create_value = "";
  }

  function commit_create() {
    const name = create_value.trim();
    creating = false;
    if (name) on_create(name);
  }

  function start_rename(section: TypeSection) {
    if (!section.path) return;
    renaming_path = section.path;
    rename_value = section.label;
  }

  function commit_rename(section: TypeSection) {
    const next = rename_value.trim();
    renaming_path = null;
    if (next && next !== section.label) on_rename(section, next);
  }
</script>

<div class="TypesRail">
  <div class="TypesRail__header">
    <button type="button" class="TypesRail__toggle" onclick={toggle}>
      {#if open}
        <ChevronDown class="TypesRail__chevron" />
      {:else}
        <ChevronRight class="TypesRail__chevron" />
      {/if}
      <span>TYPES</span>
    </button>
    <div class="TypesRail__actions">
      <button
        type="button"
        class="TypesRail__icon-button"
        aria-label={show_hidden ? "Conceal hidden types" : "Show hidden types"}
        title={show_hidden ? "Conceal hidden types" : "Show hidden types"}
        aria-pressed={show_hidden}
        onclick={() => (show_hidden = !show_hidden)}
      >
        {#if show_hidden}
          <EyeOff class="TypesRail__action-icon" />
        {:else}
          <Eye class="TypesRail__action-icon" />
        {/if}
      </button>
      <button
        type="button"
        class="TypesRail__icon-button"
        aria-label="Create type"
        title="Create type"
        onclick={start_create}
      >
        <Plus class="TypesRail__action-icon" />
      </button>
    </div>
  </div>

  {#if open}
    <ul class="TypesRail__list">
      {#if creating}
        <li class="TypesRail__row">
          <input
            class="TypesRail__rename"
            placeholder="Type name..."
            bind:value={create_value}
            use:focus_on_mount
            onblur={commit_create}
            onkeydown={(e) => {
              if (e.key === "Enter") commit_create();
              if (e.key === "Escape") creating = false;
            }}
          />
        </li>
      {/if}
      {#each visible_sections as section (section.name)}
        <ContextMenu.Root>
          <ContextMenu.Trigger class="TypesRail__trigger">
            <li
              class="TypesRail__row"
              class:is-active={section.name === active_type}
              class:is-hidden={!section.visible}
            >
              {#if renaming_path === section.path}
                <input
                  class="TypesRail__rename"
                  bind:value={rename_value}
                  use:focus_on_mount
                  onblur={() => commit_rename(section)}
                  onkeydown={(e) => {
                    if (e.key === "Enter") commit_rename(section);
                    if (e.key === "Escape") renaming_path = null;
                  }}
                />
              {:else}
                <button
                  type="button"
                  class="TypesRail__select"
                  onclick={() => on_select(section.name)}
                >
                  <Tag
                    class="TypesRail__type-icon"
                    style={`color: ${section.color}`}
                  />
                  <span class="TypesRail__label">{section.label}</span>
                  <span class="TypesRail__count">{section.count}</span>
                </button>
              {/if}
            </li>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>
              <ContextMenu.Item
                disabled={!section.path}
                onSelect={() => start_rename(section)}
              >
                <Pencil class="TypesRail__menu-icon" />
                Rename
              </ContextMenu.Item>
              <ContextMenu.Item
                disabled={!section.path}
                onSelect={() => on_customize(section)}
              >
                <Palette class="TypesRail__menu-icon" />
                Customize icon &amp; color
              </ContextMenu.Item>
              <ContextMenu.Item
                disabled={!section.path}
                onSelect={() => on_toggle_visibility(section)}
              >
                {#if section.visible}
                  <EyeOff class="TypesRail__menu-icon" />
                  Hide
                {:else}
                  <Eye class="TypesRail__menu-icon" />
                  Show
                {/if}
              </ContextMenu.Item>
              <ContextMenu.Item
                disabled={!section.path}
                onSelect={() => on_delete(section)}
              >
                <Trash2 class="TypesRail__menu-icon" />
                Delete
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .TypesRail {
    border-block-end: 1px solid var(--border);
  }

  .TypesRail__header {
    display: flex;
    align-items: center;
    padding-inline-end: var(--space-2);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .TypesRail__header:hover {
    background-color: var(--accent);
  }

  .TypesRail__toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex: 1;
    padding: var(--space-1-5) var(--space-2);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--foreground);
    text-align: start;
  }

  :global(.TypesRail__chevron) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    opacity: 0.5;
  }

  .TypesRail__actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .TypesRail__header:hover .TypesRail__actions {
    opacity: 1;
  }

  .TypesRail__icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
    padding: var(--space-1);
  }

  .TypesRail__icon-button:hover {
    color: var(--foreground);
  }

  :global(.TypesRail__action-icon) {
    width: 14px;
    height: 14px;
  }

  .TypesRail__list {
    display: flex;
    flex-direction: column;
  }

  :global(.TypesRail__trigger) {
    width: 100%;
    display: block;
  }

  .TypesRail__row {
    display: flex;
    align-items: center;
    width: 100%;
  }

  .TypesRail__row.is-active {
    background-color: var(--accent);
  }

  .TypesRail__row.is-hidden {
    opacity: 0.5;
  }

  .TypesRail__select {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-6);
    font-size: var(--text-sm);
    color: var(--foreground);
    text-align: start;
  }

  .TypesRail__select:hover {
    background-color: var(--accent);
  }

  :global(.TypesRail__type-icon) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .TypesRail__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .TypesRail__count {
    font-size: var(--text-2xs);
    color: var(--muted-foreground);
    padding-inline: var(--space-1-5);
    border-radius: var(--radius-full);
    background-color: var(--muted);
  }

  .TypesRail__rename {
    flex: 1;
    margin-inline: var(--space-6) var(--space-2);
    font-size: var(--text-sm);
    background-color: var(--background);
    border: 1px solid var(--interactive);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-1);
  }

  :global(.TypesRail__menu-icon) {
    width: 14px;
    height: 14px;
    margin-inline-end: var(--space-2);
  }
</style>
