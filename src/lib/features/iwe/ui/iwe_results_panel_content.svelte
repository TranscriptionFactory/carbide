<script lang="ts">
  import {
    Link,
    Sparkles,
    ListTree,
    FileText,
    Play,
    MapPin,
  } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type {
    IweLocation,
    IweCodeAction,
    IweDocumentSymbol,
    IweSymbol,
  } from "$lib/features/iwe";

  const { stores, action_registry } = use_app_context();

  const references = $derived(stores.iwe.references);
  const code_actions = $derived(stores.iwe.code_actions);
  const symbols = $derived(stores.iwe.symbols);
  const document_symbols = $derived(stores.iwe.document_symbols);
  const loading = $derived(stores.iwe.loading);
  const iwe_error = $derived(stores.iwe.error);
  const iwe_status = $derived(stores.iwe.status);
  const is_connected = $derived(iwe_status === "running");
  const vault_uri_prefix = $derived.by(() => {
    const vault_path = stores.vault.vault?.path;
    return vault_path ? `file://${vault_path}/` : null;
  });

  type ResultTab =
    | "references"
    | "code_actions"
    | "symbols"
    | "document_symbols";
  let active_tab = $state<ResultTab>("references");

  const tab_counts = $derived({
    references: references.length,
    code_actions: code_actions.length,
    symbols: symbols.length,
    document_symbols: document_symbols.length,
  });

  function strip_vault_prefix(uri: string): string | null {
    if (!vault_uri_prefix || !uri.startsWith(vault_uri_prefix)) return null;
    return uri.slice(vault_uri_prefix.length);
  }

  function navigate_to_location(location: IweLocation) {
    const relative_path = strip_vault_prefix(location.uri);
    if (!relative_path) return;
    void action_registry.execute(ACTION_IDS.note_open, relative_path);
  }

  function resolve_code_action(action: IweCodeAction) {
    void action_registry.execute(ACTION_IDS.iwe_code_action_resolve, action);
  }

  function navigate_to_symbol(symbol: IweSymbol) {
    navigate_to_location(symbol.location);
  }

  function navigate_to_document_symbol(symbol: IweDocumentSymbol) {
    navigate_to_location(symbol.location);
  }

  function format_uri(uri: string): string {
    return strip_vault_prefix(uri) ?? uri;
  }
</script>

<div class="IweResults">
  <div class="IweResults__header">
    <div class="IweResults__tabs">
      <button
        type="button"
        class="IweResults__tab"
        class:IweResults__tab--active={active_tab === "references"}
        onclick={() => (active_tab = "references")}
      >
        <Link class="IweResults__tab-icon" />
        References
        {#if tab_counts.references > 0}
          <span class="IweResults__badge">{tab_counts.references}</span>
        {/if}
      </button>
      <button
        type="button"
        class="IweResults__tab"
        class:IweResults__tab--active={active_tab === "code_actions"}
        onclick={() => (active_tab = "code_actions")}
      >
        <Sparkles class="IweResults__tab-icon" />
        Code Actions
        {#if tab_counts.code_actions > 0}
          <span class="IweResults__badge">{tab_counts.code_actions}</span>
        {/if}
      </button>
      <button
        type="button"
        class="IweResults__tab"
        class:IweResults__tab--active={active_tab === "symbols"}
        onclick={() => (active_tab = "symbols")}
      >
        <ListTree class="IweResults__tab-icon" />
        Symbols
        {#if tab_counts.symbols > 0}
          <span class="IweResults__badge">{tab_counts.symbols}</span>
        {/if}
      </button>
      <button
        type="button"
        class="IweResults__tab"
        class:IweResults__tab--active={active_tab === "document_symbols"}
        onclick={() => (active_tab = "document_symbols")}
      >
        <MapPin class="IweResults__tab-icon" />
        Doc Symbols
        {#if tab_counts.document_symbols > 0}
          <span class="IweResults__badge">{tab_counts.document_symbols}</span>
        {/if}
      </button>
    </div>
    {#if loading}
      <span class="IweResults__loading">Loading…</span>
    {/if}
    {#if iwe_error}
      <span class="IweResults__error" title={iwe_error}>Error: {iwe_error}</span
      >
    {/if}
  </div>

  <div class="IweResults__body">
    {#if !is_connected}
      <div class="IweResults__empty">
        {#if iwe_status === "starting"}
          IWE is starting…
        {:else if iwe_status === "error"}
          IWE encountered an error. Check Settings &gt; Tools.
        {:else}
          IWE is not connected. Enable it in Settings &gt; Tools.
        {/if}
      </div>
    {:else if active_tab === "references"}
      {#if references.length === 0}
        <div class="IweResults__empty">
          No references found. Use "IWE: Find References" from the command
          palette.
        </div>
      {:else}
        {#each references as ref, i (`ref-${ref.uri}-${ref.range.start_line}-${i}`)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="IweResults__row"
            onclick={() => navigate_to_location(ref)}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") navigate_to_location(ref);
            }}
            role="button"
            tabindex="0"
          >
            <FileText class="IweResults__row-icon" />
            <span class="IweResults__row-path">{format_uri(ref.uri)}</span>
            <span class="IweResults__row-location">
              Ln {ref.range.start_line + 1}, Col {ref.range.start_character + 1}
            </span>
          </div>
        {/each}
      {/if}
    {:else if active_tab === "code_actions"}
      {#if code_actions.length === 0}
        <div class="IweResults__empty">
          No code actions available. Use "IWE: Code Actions" from the command
          palette.
        </div>
      {:else}
        {#each code_actions as action, i (`action-${action.title}-${i}`)}
          <div class="IweResults__row IweResults__row--action">
            <Sparkles class="IweResults__row-icon" />
            <span class="IweResults__row-label">{action.title}</span>
            {#if action.kind}
              <span class="IweResults__row-kind">{action.kind}</span>
            {/if}
            <button
              type="button"
              class="IweResults__apply-btn"
              onclick={() => resolve_code_action(action)}
              title="Apply this action"
              aria-label="Apply {action.title}"
            >
              <Play />
            </button>
          </div>
        {/each}
      {/if}
    {:else if active_tab === "symbols"}
      {#if symbols.length === 0}
        <div class="IweResults__empty">
          No workspace symbols found. Use "IWE: Workspace Symbols" from the
          command palette.
        </div>
      {:else}
        {#each symbols as symbol, i (`sym-${symbol.name}-${i}`)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="IweResults__row"
            onclick={() => navigate_to_symbol(symbol)}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ")
                navigate_to_symbol(symbol);
            }}
            role="button"
            tabindex="0"
          >
            <ListTree class="IweResults__row-icon" />
            <span class="IweResults__row-label">{symbol.name}</span>
            <span class="IweResults__row-path"
              >{format_uri(symbol.location.uri)}</span
            >
            <span class="IweResults__row-location">
              Ln {symbol.location.range.start_line + 1}
            </span>
          </div>
        {/each}
      {/if}
    {:else if active_tab === "document_symbols"}
      {#if document_symbols.length === 0}
        <div class="IweResults__empty">
          No document symbols found. Use "IWE: Document Symbols" from the
          command palette.
        </div>
      {:else}
        {#each document_symbols as symbol, i (`dsym-${symbol.name}-${i}`)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="IweResults__row"
            onclick={() => navigate_to_document_symbol(symbol)}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ")
                navigate_to_document_symbol(symbol);
            }}
            role="button"
            tabindex="0"
          >
            <MapPin class="IweResults__row-icon" />
            <span class="IweResults__row-label">{symbol.name}</span>
            {#if symbol.container_name}
              <span class="IweResults__row-kind">{symbol.container_name}</span>
            {/if}
            <span class="IweResults__row-path"
              >{format_uri(symbol.location.uri)}</span
            >
            <span class="IweResults__row-location">
              Ln {symbol.location.range.start_line + 1}
            </span>
          </div>
        {/each}
      {/if}
    {/if}
  </div>
</div>

<style>
  .IweResults {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    color: var(--foreground);
    font-size: var(--text-sm);
  }

  .IweResults__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .IweResults__tabs {
    display: flex;
    align-items: center;
    gap: var(--space-0-5);
  }

  .IweResults__tab {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-0-5) var(--space-2);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    border-bottom: 2px solid transparent;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    opacity: 0.7;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .IweResults__tab:hover {
    opacity: 1;
    color: var(--foreground);
  }

  .IweResults__tab--active {
    opacity: 1;
    color: var(--foreground);
    border-bottom-color: var(--primary);
  }

  :global(.IweResults__tab-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .IweResults__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.1em;
    padding: 0 var(--space-0-5);
    font-size: var(--text-xs);
    font-feature-settings: "tnum" 1;
    border-radius: var(--radius-full, 9999px);
    background-color: var(--muted);
    color: var(--muted-foreground);
    line-height: 1.4;
  }

  .IweResults__loading {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }

  .IweResults__error {
    font-size: var(--text-xs);
    color: var(--destructive);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 300px;
  }

  .IweResults__body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .IweResults__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }

  .IweResults__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-3);
    text-align: left;
    font-size: var(--text-xs);
    color: var(--foreground);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .IweResults__row:hover {
    background-color: var(--muted);
  }

  .IweResults__row:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  :global(.IweResults__row-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  .IweResults__row-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--primary);
  }

  .IweResults__row-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .IweResults__row-kind {
    flex-shrink: 0;
    color: var(--muted-foreground);
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    opacity: 0.7;
  }

  .IweResults__row-location {
    flex-shrink: 0;
    color: var(--muted-foreground);
    font-feature-settings: "tnum" 1;
    opacity: 0.6;
  }

  .IweResults__apply-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    opacity: 0;
    flex-shrink: 0;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .IweResults__row:hover .IweResults__apply-btn {
    opacity: 0.7;
  }

  .IweResults__apply-btn:hover {
    opacity: 1;
    color: var(--interactive);
  }

  :global(.IweResults__apply-btn svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }
</style>
