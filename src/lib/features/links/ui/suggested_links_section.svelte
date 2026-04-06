<script lang="ts">
  import LinkSection from "$lib/features/links/ui/link_section.svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import {
    rule_chip_label,
    rule_chip_title,
    type SmartLinkRuleMatch,
  } from "$lib/features/smart_links";

  const { stores, action_registry } = use_app_context();

  const loading = $derived(stores.links.suggested_links_loading);
  const suggestions = $derived(stores.links.suggested_links);

  function similarity_label(similarity: number): string {
    return `${String(Math.round(similarity * 100))}%`;
  }

  function insert_link(title: string) {
    void action_registry.execute(ACTION_IDS.links_insert_suggested_link, title);
  }

  function has_rules(rules: SmartLinkRuleMatch[] | undefined): boolean {
    return rules !== undefined && rules.length > 0;
  }
</script>

<LinkSection
  title="Suggested"
  count={suggestions.length}
  default_expanded={true}
>
  {#if loading}
    <p class="SuggestedLinksSection__state">Loading suggestions...</p>
  {:else if suggestions.length === 0}
    <p class="SuggestedLinksSection__state">No suggestions</p>
  {:else}
    {#each suggestions as suggestion (suggestion.note.path)}
      <div class="SuggestedLinksSection__item">
        <div class="SuggestedLinksSection__item-info">
          <span class="SuggestedLinksSection__item-title">
            {suggestion.note.title || suggestion.note.name}
          </span>
          <span class="SuggestedLinksSection__item-badge">
            {similarity_label(suggestion.similarity)}
          </span>
          {#if has_rules(suggestion.rules)}
            {#each suggestion.rules as rule (rule.ruleId)}
              <span
                class="SuggestedLinksSection__rule-chip"
                title={rule_chip_title(rule)}
              >
                {rule_chip_label(rule.ruleId)}
              </span>
            {/each}
          {/if}
        </div>
        <button
          type="button"
          class="SuggestedLinksSection__add-btn"
          onclick={() =>
            insert_link(suggestion.note.title || suggestion.note.name)}
          title="Insert wiki-link"
        >
          <PlusIcon />
        </button>
      </div>
    {/each}
  {/if}
</LinkSection>

<style>
  .SuggestedLinksSection__state {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding: var(--space-1) var(--space-3) var(--space-1) var(--space-6);
    margin: 0;
  }

  .SuggestedLinksSection__item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .SuggestedLinksSection__item:hover {
    background-color: var(--muted);
  }

  .SuggestedLinksSection__item-info {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    flex: 1;
    flex-wrap: wrap;
  }

  .SuggestedLinksSection__item-title {
    font-size: var(--text-sm);
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .SuggestedLinksSection__item-badge {
    flex-shrink: 0;
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-1);
  }

  .SuggestedLinksSection__rule-chip {
    flex-shrink: 0;
    font-size: 10px;
    line-height: 1.4;
    color: var(--muted-foreground);
    background-color: var(--muted);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-1);
  }

  .SuggestedLinksSection__add-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
    border: none;
    background: none;
    cursor: pointer;
    color: var(--muted-foreground);
    border-radius: var(--radius-sm);
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .SuggestedLinksSection__add-btn:hover {
    color: var(--foreground);
    background-color: var(--accent);
  }

  .SuggestedLinksSection__add-btn :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
