<script lang="ts">
  import {
    ShieldCheck,
    FolderClosed,
    FileCode,
    RefreshCw,
  } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import type { TrustEntry } from "$lib/features/document/ports";

  const { stores, services } = use_app_context();

  let entries = $state<TrustEntry[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  const trust_levels_ref = $derived(stores.document.trust_levels);
  const vault_id = $derived(stores.vault.vault?.id ?? null);

  async function load() {
    loading = true;
    error = null;
    try {
      const next = await services.document.list_trusted_html();
      entries = sort_entries(next);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function sort_entries(rows: TrustEntry[]): TrustEntry[] {
    return [...rows].sort((a, b) => {
      if (a.scope !== b.scope) return a.scope === "folder" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
  }

  async function revoke(entry: TrustEntry) {
    try {
      await services.document.revoke_trust(entry.path, entry.scope);
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  $effect(() => {
    void trust_levels_ref;
    void vault_id;
    void load();
  });

  const LEVEL_LABEL: Record<TrustEntry["level"], string> = {
    safe: "safe",
    live: "live",
    "live+net": "live + net",
  };
</script>

<div class="TrustPanel">
  <div class="TrustPanel__header">
    <span class="TrustPanel__title">
      <ShieldCheck class="TrustPanel__title-icon" />
      Trusted HTML
    </span>
    <button
      type="button"
      class="TrustPanel__refresh"
      onclick={load}
      title="Refresh"
      aria-label="Refresh trust list"
      disabled={loading}
    >
      <RefreshCw />
    </button>
  </div>

  <div class="TrustPanel__body">
    {#if error}
      <div class="TrustPanel__error">{error}</div>
    {:else if loading && entries.length === 0}
      <div class="TrustPanel__empty">Loading…</div>
    {:else if entries.length === 0}
      <div class="TrustPanel__empty">No trusted HTML files or folders.</div>
    {:else}
      {#each entries as entry (entry.scope + ":" + entry.path)}
        <div class="TrustPanel__row">
          {#if entry.scope === "folder"}
            <FolderClosed class="TrustPanel__row-icon" />
          {:else}
            <FileCode class="TrustPanel__row-icon" />
          {/if}
          <span class="TrustPanel__path" title={entry.path}>{entry.path}</span>
          <span
            class="TrustPanel__badge TrustPanel__badge--{entry.level.replace(
              '+',
              '-net',
            )}"
          >
            {LEVEL_LABEL[entry.level]}
          </span>
          <Button size="sm" variant="outline" onclick={() => revoke(entry)}>
            Revoke
          </Button>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .TrustPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    color: var(--foreground);
    font-size: var(--text-sm);
  }

  .TrustPanel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .TrustPanel__title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  :global(.TrustPanel__title-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .TrustPanel__refresh {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    transition: color var(--duration-fast) var(--ease-default);
  }

  .TrustPanel__refresh:hover:not(:disabled) {
    color: var(--foreground);
    background-color: var(--accent);
  }

  .TrustPanel__refresh:disabled {
    opacity: 0.4;
    cursor: default;
  }

  :global(.TrustPanel__refresh > svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .TrustPanel__body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .TrustPanel__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted-foreground);
    padding: var(--space-4);
    text-align: center;
    font-size: var(--text-xs);
  }

  .TrustPanel__error {
    padding: var(--space-2) var(--space-3);
    color: var(--destructive);
    font-size: var(--text-xs);
  }

  .TrustPanel__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    font-size: var(--text-xs);
  }

  .TrustPanel__row:hover {
    background-color: var(--muted);
  }

  :global(.TrustPanel__row-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  .TrustPanel__path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
    font-feature-settings: "tnum" 1;
  }

  .TrustPanel__badge {
    flex-shrink: 0;
    padding: 0 var(--space-1);
    font-size: var(--text-xs);
    border-radius: var(--radius-sm);
    background-color: var(--muted);
    color: var(--muted-foreground);
    line-height: 1.6;
  }

  .TrustPanel__badge--live {
    color: var(--primary);
    background-color: color-mix(in oklch, var(--primary) 12%, transparent);
  }

  .TrustPanel__badge--live-net {
    color: var(--warning, var(--chart-4));
    background-color: color-mix(
      in oklch,
      var(--warning, var(--chart-4)) 14%,
      transparent
    );
  }
</style>
