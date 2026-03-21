<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import FileTextIcon from "@lucide/svelte/icons/file-text";

  const { stores } = use_app_context();

  const properties = $derived(stores.metadata.properties);
  const tags = $derived(stores.metadata.tags);
  const loading = $derived(stores.metadata.loading);
  const error = $derived(stores.metadata.error);
  const has_data = $derived(properties.length > 0 || tags.length > 0);

  const frontmatter_tags = $derived(
    tags.filter((t) => t.source === "frontmatter"),
  );
  const inline_tags = $derived(tags.filter((t) => t.source === "inline"));
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
  {:else if !has_data}
    <div class="MetadataPanel__empty">
      <div class="MetadataPanel__empty-icon">
        <FileTextIcon />
      </div>
      <p class="MetadataPanel__empty-text">No metadata</p>
    </div>
  {:else}
    {#if properties.length > 0}
      <section class="MetadataPanel__section">
        <h3 class="MetadataPanel__section-title">Properties</h3>
        <dl class="MetadataPanel__props">
          {#each properties as prop (prop.key)}
            <div class="MetadataPanel__prop">
              <dt class="MetadataPanel__prop-key">{prop.key}</dt>
              <dd class="MetadataPanel__prop-value" title={prop.value}>
                {prop.value}
              </dd>
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
