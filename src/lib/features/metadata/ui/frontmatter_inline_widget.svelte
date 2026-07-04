<script lang="ts">
  import type { MetadataStore } from "../state/metadata_store.svelte";
  import ColorSwatchPicker from "./color_swatch_picker.svelte";
  import IconPicker from "./icon_picker.svelte";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import CheckIcon from "@lucide/svelte/icons/check";
  import XIcon from "@lucide/svelte/icons/x";

  type Props = {
    metadata_store: MetadataStore | null;
    is_enabled: () => boolean;
    on_update: (key: string, value: string) => void;
    on_add: (key: string, value: string) => void;
    on_remove: (key: string) => void;
  };

  let { metadata_store, is_enabled, on_update, on_add, on_remove }: Props =
    $props();

  const enabled = $derived(is_enabled());
  const properties = $derived(metadata_store?.properties ?? []);
  const tags = $derived(metadata_store?.tags ?? []);
  const editing_key = $derived(metadata_store?.editing_key ?? null);
  const has_content = $derived(properties.length > 0 || tags.length > 0);

  let collapsed = $state(false);
  let edit_value = $state("");
  let adding = $state(false);
  let new_key = $state("");
  let new_value = $state("");

  function value_text(value: string | string[]): string {
    return Array.isArray(value) ? value.join(", ") : value;
  }

  function start_edit(key: string, current: string) {
    metadata_store?.begin_edit(key);
    edit_value = current;
  }

  function commit_edit(key: string) {
    on_update(key, edit_value);
  }

  function cancel_edit() {
    metadata_store?.cancel_edit();
  }

  function start_add() {
    adding = true;
    new_key = "";
    new_value = "";
  }

  function confirm_add() {
    if (!new_key.trim()) return;
    on_add(new_key.trim(), new_value);
    adding = false;
  }

  function cancel_add() {
    adding = false;
  }
</script>

{#if enabled && has_content}
  <div class="FrontmatterInline" contenteditable="false">
    <div class="FrontmatterInline__header">
      <button
        type="button"
        class="FrontmatterInline__toggle"
        onclick={() => (collapsed = !collapsed)}
      >
        {#if collapsed}<ChevronRightIcon />{:else}<ChevronDownIcon />{/if}
        <span>Properties ({properties.length})</span>
      </button>
      {#if !collapsed}
        <button
          type="button"
          class="FrontmatterInline__icon-btn"
          title="Add property"
          onclick={start_add}
        >
          <PlusIcon />
        </button>
      {/if}
    </div>

    {#if !collapsed}
      {#if adding}
        <div class="FrontmatterInline__add">
          <input
            class="FrontmatterInline__input"
            placeholder="Key"
            bind:value={new_key}
            onkeydown={(e) => {
              if (e.key === "Escape") cancel_add();
            }}
          />
          <input
            class="FrontmatterInline__input"
            placeholder="Value"
            bind:value={new_value}
            onkeydown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirm_add();
              } else if (e.key === "Escape") {
                cancel_add();
              }
            }}
          />
          <button
            type="button"
            class="FrontmatterInline__icon-btn"
            onclick={confirm_add}
          >
            <CheckIcon />
          </button>
          <button
            type="button"
            class="FrontmatterInline__icon-btn"
            onclick={cancel_add}
          >
            <XIcon />
          </button>
        </div>
      {/if}

      {#if properties.length > 0}
        <dl class="FrontmatterInline__props">
          {#each properties as prop (prop.key)}
            <div class="FrontmatterInline__prop">
              <dt class="FrontmatterInline__prop-key">{prop.key}</dt>
              {#if editing_key === prop.key}
                {#if prop.key === "color"}
                  <ColorSwatchPicker
                    value={typeof prop.value === "string" ? prop.value : null}
                    on_select={(color) => on_update(prop.key, color)}
                  />
                  <button
                    type="button"
                    class="FrontmatterInline__icon-btn"
                    onclick={cancel_edit}
                  >
                    <XIcon />
                  </button>
                {:else if prop.key === "icon"}
                  <IconPicker
                    value={typeof prop.value === "string" ? prop.value : null}
                    on_select={(icon) => on_update(prop.key, icon)}
                  />
                  <button
                    type="button"
                    class="FrontmatterInline__icon-btn"
                    onclick={cancel_edit}
                  >
                    <XIcon />
                  </button>
                {:else}
                  <input
                    class="FrontmatterInline__input"
                    bind:value={edit_value}
                    onkeydown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commit_edit(prop.key);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancel_edit();
                      }
                    }}
                    onblur={() => commit_edit(prop.key)}
                  />
                {/if}
              {:else if Array.isArray(prop.value)}
                <dd
                  class="FrontmatterInline__prop-value FrontmatterInline__prop-value--list"
                >
                  {#each prop.value as item, i (i)}
                    <span class="FrontmatterInline__tag">{item}</span>
                  {/each}
                </dd>
                <div class="FrontmatterInline__prop-actions">
                  <button
                    type="button"
                    class="FrontmatterInline__icon-btn"
                    title="Edit"
                    onclick={() => start_edit(prop.key, value_text(prop.value))}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    class="FrontmatterInline__icon-btn FrontmatterInline__icon-btn--danger"
                    title="Delete"
                    onclick={() => on_remove(prop.key)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              {:else}
                <dd class="FrontmatterInline__prop-value" title={prop.value}>
                  {prop.value}
                </dd>
                <div class="FrontmatterInline__prop-actions">
                  <button
                    type="button"
                    class="FrontmatterInline__icon-btn"
                    title="Edit"
                    onclick={() => start_edit(prop.key, value_text(prop.value))}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    class="FrontmatterInline__icon-btn FrontmatterInline__icon-btn--danger"
                    title="Delete"
                    onclick={() => on_remove(prop.key)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </dl>
      {/if}

      {#if tags.length > 0}
        <div class="FrontmatterInline__tags">
          {#each tags as t (t.tag)}
            <span
              class="FrontmatterInline__tag"
              class:FrontmatterInline__tag--inline={t.source === "inline"}
              >{t.tag}</span
            >
          {/each}
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .FrontmatterInline {
    margin-block-end: var(--space-3);
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--muted);
    font-size: var(--text-xs);
    user-select: none;
  }

  .FrontmatterInline__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .FrontmatterInline__toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
  }

  :global(.FrontmatterInline__toggle svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .FrontmatterInline__add {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    margin-block-start: var(--space-2);
  }

  .FrontmatterInline__input {
    height: var(--size-7, 1.75rem);
    min-width: 0;
    flex: 1;
    border-radius: var(--radius-sm);
    border: 1px solid var(--input);
    background: var(--background);
    padding-inline: var(--space-2);
    font-size: var(--text-xs);
    color: var(--foreground);
  }

  .FrontmatterInline__props {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    margin-block-start: var(--space-2);
  }

  .FrontmatterInline__prop {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    line-height: 1.5;
  }

  .FrontmatterInline__prop:hover .FrontmatterInline__icon-btn {
    opacity: 1;
  }

  .FrontmatterInline__prop-key {
    flex-shrink: 0;
    font-weight: 500;
    color: var(--muted-foreground);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 40%;
  }

  .FrontmatterInline__prop-value {
    color: var(--foreground);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .FrontmatterInline__prop-value--list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    overflow: visible;
    white-space: normal;
  }

  .FrontmatterInline__prop-actions {
    display: flex;
    gap: var(--space-0-5);
    flex-shrink: 0;
  }

  .FrontmatterInline__icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-0-5);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0;
    transition: all var(--duration-fast) var(--ease-default);
  }

  .FrontmatterInline__header .FrontmatterInline__icon-btn,
  .FrontmatterInline__add .FrontmatterInline__icon-btn {
    opacity: 1;
  }

  :global(.FrontmatterInline__icon-btn svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .FrontmatterInline__icon-btn:hover {
    color: var(--foreground);
    background: var(--accent);
  }

  .FrontmatterInline__icon-btn--danger:hover {
    color: var(--destructive);
  }

  .FrontmatterInline__tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-block-start: var(--space-2);
  }

  .FrontmatterInline__tag {
    display: inline-flex;
    align-items: center;
    padding-inline: var(--space-1-5);
    padding-block: var(--space-0-5);
    border-radius: var(--radius-sm);
    background-color: var(--accent);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--accent-foreground);
    line-height: 1;
  }

  .FrontmatterInline__tag--inline {
    border: 1px dashed var(--border);
    background-color: transparent;
  }
</style>
