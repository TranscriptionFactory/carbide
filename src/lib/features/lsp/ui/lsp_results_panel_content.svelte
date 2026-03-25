<script lang="ts">
  import { Sparkles, Play } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { LspCodeAction } from "$lib/features/lsp";

  const { stores, action_registry } = use_app_context();

  const code_actions = $derived(stores.lsp.code_actions);

  function resolve_code_action(action: LspCodeAction) {
    void action_registry.execute(ACTION_IDS.lsp_code_action_resolve, action);
  }
</script>

<div class="LspResults">
  {#if code_actions.length === 0}
    <div class="LspResults__empty">
      No code actions available. Press <kbd>Cmd+.</kbd> in the editor or use "Code
      Actions" from the command palette.
    </div>
  {:else}
    {#each code_actions as action, i (`action-${action.source}-${action.title}-${i}`)}
      <div class="LspResults__row">
        <Sparkles class="LspResults__row-icon" />
        <span class="LspResults__row-label">{action.title}</span>
        {#if action.kind}
          <span class="LspResults__row-kind">{action.kind}</span>
        {/if}
        <span class="LspResults__row-source">{action.source}</span>
        <button
          type="button"
          class="LspResults__apply-btn"
          onclick={() => resolve_code_action(action)}
          title="Apply this action"
          aria-label="Apply {action.title}"
        >
          <Play />
        </button>
      </div>
    {/each}
  {/if}
</div>

<style>
  .LspResults {
    height: 100%;
    overflow-y: auto;
    font-size: var(--text-sm);
  }

  .LspResults__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted-foreground);
    padding: var(--space-4);
    text-align: center;
  }

  .LspResults__empty kbd {
    display: inline-block;
    padding: 0 var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background-color: var(--muted);
    font-size: var(--text-xs);
    font-family: inherit;
  }

  .LspResults__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    cursor: default;
  }

  .LspResults__row:hover {
    background-color: var(--muted);
  }

  :global(.LspResults__row-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  .LspResults__row-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .LspResults__row-kind {
    flex-shrink: 0;
    padding: 0 var(--space-1);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    background-color: var(--muted);
    border-radius: var(--radius-sm);
  }

  .LspResults__row-source {
    flex-shrink: 0;
    padding: 0 var(--space-1);
    font-size: var(--text-xs);
    color: var(--primary);
    background-color: color-mix(in oklch, var(--primary) 10%, transparent);
    border-radius: var(--radius-sm);
  }

  .LspResults__apply-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .LspResults__row:hover .LspResults__apply-btn {
    opacity: 1;
  }

  .LspResults__apply-btn:hover {
    color: var(--foreground);
    background-color: var(--accent);
  }

  :global(.LspResults__apply-btn > svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }
</style>
