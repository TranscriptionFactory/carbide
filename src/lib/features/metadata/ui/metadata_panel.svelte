<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import XIcon from "@lucide/svelte/icons/x";
  import CheckIcon from "@lucide/svelte/icons/check";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import PropertyCombobox from "./property_combobox.svelte";
  import {
    build_key_suggestions,
    value_suggestions_for_key,
  } from "../domain/property_suggestions";

  const { stores, action_registry } = use_app_context();

  const properties = $derived(stores.metadata.properties);
  const tags = $derived(stores.metadata.tags);
  const loading = $derived(stores.metadata.loading);
  const error = $derived(stores.metadata.error);
  const has_data = $derived(properties.length > 0 || tags.length > 0);
  const editing_key = $derived(stores.metadata.editing_key);
  const adding = $derived(stores.metadata.adding);

  let new_key = $state("");
  let new_value = $state("");
  let edit_value = $state("");

  const registry = $derived(stores.metadata.property_registry);
  const existing_keys = $derived(properties.map((p) => p.key));

  const key_items = $derived(
    build_key_suggestions(new_key, registry, existing_keys).map((s) => ({
      value: s.key,
      hint: s.type,
      description:
        s.description ??
        (s.count !== null
          ? `used in ${s.count} ${s.count === 1 ? "note" : "notes"}`
          : null),
      indices: s.indices,
    })),
  );

  const add_value_items = $derived(
    value_suggestions_for_key(new_key, new_value, registry),
  );
  const edit_value_items = $derived(
    editing_key
      ? value_suggestions_for_key(editing_key, edit_value, registry)
      : [],
  );

  const frontmatter_tags = $derived(
    tags.filter((t) => t.source === "frontmatter"),
  );
  const inline_tags = $derived(tags.filter((t) => t.source === "inline"));

  function handle_add() {
    stores.metadata.begin_add();
    new_key = "";
    new_value = "";
    action_registry.execute(ACTION_IDS.metadata_load_suggestions);
  }

  function confirm_add() {
    if (!new_key.trim()) return;
    action_registry.execute(
      ACTION_IDS.metadata_add_property,
      new_key.trim(),
      new_value,
    );
  }

  function handle_edit(key: string, current_value: string) {
    stores.metadata.begin_edit(key);
    edit_value = current_value;
    action_registry.execute(ACTION_IDS.metadata_load_suggestions);
  }

  function confirm_edit(key: string) {
    action_registry.execute(
      ACTION_IDS.metadata_update_property,
      key,
      edit_value,
    );
  }

  function handle_delete(key: string) {
    action_registry.execute(ACTION_IDS.metadata_delete_property, key);
  }

  function cancel() {
    stores.metadata.cancel_edit();
  }
</script>

<div class="MetadataPanel">
  {#if loading}
    <div class="MetadataPanel__empty">
      <p class="MetadataPanel__empty-text">Loading...</p>
    </div>
  {:else if error}
    <div class="MetadataPanel__empty">
      <p class="MetadataPanel__empty-text MetadataPanel__error">{error}</p>
    </div>
  {:else if !has_data && !adding}
    <div class="MetadataPanel__empty">
      <div class="MetadataPanel__empty-icon">
        <FileTextIcon />
      </div>
      <p class="MetadataPanel__empty-text">No metadata</p>
      <button class="MetadataPanel__add-btn" onclick={handle_add}>
        <PlusIcon />
        <span>Add Property</span>
      </button>
    </div>
  {:else}
    <div class="MetadataPanel__header">
      <button
        class="MetadataPanel__add-btn"
        onclick={handle_add}
        disabled={adding}
      >
        <PlusIcon />
        <span>Add Property</span>
      </button>
    </div>

    {#if adding}
      <div class="MetadataPanel__inline-form">
        <PropertyCombobox
          value={new_key}
          items={key_items}
          placeholder="Key"
          autofocus
          on_input={(t) => (new_key = t)}
          on_select={(v) => (new_key = v)}
          on_enter={confirm_add}
          on_escape={cancel}
        />
        <PropertyCombobox
          value={new_value}
          items={add_value_items}
          placeholder="Value"
          on_input={(t) => (new_value = t)}
          on_select={(v) => {
            new_value = v;
            confirm_add();
          }}
          on_enter={confirm_add}
          on_escape={cancel}
        />
        <div class="MetadataPanel__inline-actions">
          <button class="MetadataPanel__icon-btn" onclick={confirm_add}>
            <CheckIcon />
          </button>
          <button class="MetadataPanel__icon-btn" onclick={cancel}>
            <XIcon />
          </button>
        </div>
      </div>
    {/if}

    {#if properties.length > 0}
      <section class="MetadataPanel__section">
        <h3 class="MetadataPanel__section-title">Properties</h3>
        <dl class="MetadataPanel__props">
          {#each properties as prop (prop.key)}
            <div class="MetadataPanel__prop">
              {#if editing_key === prop.key}
                <dt class="MetadataPanel__prop-key">{prop.key}</dt>
                <PropertyCombobox
                  value={edit_value}
                  items={edit_value_items}
                  autofocus
                  on_input={(t) => (edit_value = t)}
                  on_select={(v) => {
                    edit_value = v;
                    confirm_edit(prop.key);
                  }}
                  on_enter={() => confirm_edit(prop.key)}
                  on_escape={cancel}
                />
                <div class="MetadataPanel__inline-actions">
                  <button
                    class="MetadataPanel__icon-btn"
                    onclick={() => confirm_edit(prop.key)}
                  >
                    <CheckIcon />
                  </button>
                  <button class="MetadataPanel__icon-btn" onclick={cancel}>
                    <XIcon />
                  </button>
                </div>
              {:else}
                <dt class="MetadataPanel__prop-key">{prop.key}</dt>
                <dd class="MetadataPanel__prop-value" title={prop.value}>
                  {prop.value}
                </dd>
                <div class="MetadataPanel__prop-actions">
                  <button
                    class="MetadataPanel__icon-btn"
                    onclick={() => handle_edit(prop.key, prop.value)}
                    title="Edit"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    class="MetadataPanel__icon-btn MetadataPanel__icon-btn--danger"
                    onclick={() => handle_delete(prop.key)}
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </dl>
      </section>
    {/if}

    {#if frontmatter_tags.length > 0}
      <section class="MetadataPanel__section">
        <h3 class="MetadataPanel__section-title">Frontmatter Tags</h3>
        <div class="MetadataPanel__tags">
          {#each frontmatter_tags as t (t.tag)}
            <span class="MetadataPanel__tag">{t.tag}</span>
          {/each}
        </div>
      </section>
    {/if}

    {#if inline_tags.length > 0}
      <section class="MetadataPanel__section">
        <h3 class="MetadataPanel__section-title">Inline Tags</h3>
        <div class="MetadataPanel__tags">
          {#each inline_tags as t (t.tag)}
            <span class="MetadataPanel__tag MetadataPanel__tag--inline"
              >{t.tag}</span
            >
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .MetadataPanel {
    height: 100%;
    overflow-y: auto;
    padding-block: var(--space-1);
    padding-inline: var(--space-3);
  }

  .MetadataPanel__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6);
    color: var(--muted-foreground);
  }

  .MetadataPanel__empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--size-icon-lg) * 1.5);
    height: calc(var(--size-icon-lg) * 1.5);
  }

  :global(.MetadataPanel__empty-icon svg) {
    width: var(--size-icon-lg);
    height: var(--size-icon-lg);
  }

  .MetadataPanel__empty-text {
    font-size: var(--text-sm);
  }

  .MetadataPanel__error {
    color: var(--destructive);
  }

  .MetadataPanel__header {
    display: flex;
    justify-content: flex-end;
    margin-block-end: var(--space-2);
  }

  .MetadataPanel__add-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding-inline: var(--space-2);
    padding-block: var(--space-1);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--muted-foreground);
    background: transparent;
    border: 1px dashed var(--border);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-default);
  }

  .MetadataPanel__add-btn:hover {
    color: var(--foreground);
    border-color: var(--foreground);
    background: var(--accent);
  }

  :global(.MetadataPanel__add-btn svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .MetadataPanel__inline-form {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-block-end: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--accent);
  }

  .MetadataPanel__inline-actions {
    display: flex;
    gap: var(--space-0-5);
    align-items: center;
  }

  .MetadataPanel__icon-btn {
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

  :global(.MetadataPanel__icon-btn svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .MetadataPanel__icon-btn:hover {
    color: var(--foreground);
    background: var(--accent);
  }

  .MetadataPanel__icon-btn--danger:hover {
    color: var(--destructive);
  }

  .MetadataPanel__inline-actions .MetadataPanel__icon-btn {
    opacity: 1;
  }

  .MetadataPanel__section {
    margin-block-end: var(--space-3);
  }

  .MetadataPanel__section-title {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    margin-block-end: var(--space-1);
  }

  .MetadataPanel__props {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .MetadataPanel__prop {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  .MetadataPanel__prop:hover .MetadataPanel__icon-btn {
    opacity: 1;
  }

  .MetadataPanel__prop-key {
    flex-shrink: 0;
    font-weight: 500;
    color: var(--muted-foreground);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 40%;
  }

  .MetadataPanel__prop-value {
    color: var(--foreground);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .MetadataPanel__prop-actions {
    display: flex;
    gap: var(--space-0-5);
    flex-shrink: 0;
  }

  .MetadataPanel__tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .MetadataPanel__tag {
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

  .MetadataPanel__tag--inline {
    border: 1px dashed var(--border);
    background-color: transparent;
  }
</style>
