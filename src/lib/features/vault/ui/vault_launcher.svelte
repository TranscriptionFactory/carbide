<script lang="ts">
  import type { Vault } from "$lib/shared/types/vault";
  import type { VaultId } from "$lib/shared/types/ids";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { search_vaults } from "$lib/features/vault/domain/search_vaults";
  import {
    clamp_vault_selection,
    duplicate_vault_names,
    format_last_opened,
    format_note_count,
    format_vault_path,
    is_vault_available,
    move_vault_selection,
    vault_initial,
  } from "$lib/features/vault/domain/vault_switcher";
  import { onMount } from "svelte";
  import {
    CircleHelp,
    FolderOpen,
    Pin,
    Settings,
    Trash2,
  } from "@lucide/svelte";

  interface Props {
    recent_vaults: Vault[];
    pinned_vault_ids: VaultId[];
    is_loading?: boolean;
    error?: string | null;
    app_version?: string;
    on_choose_vault_dir: () => void;
    on_select_vault: (vault_id: VaultId) => void;
    on_toggle_pin_vault: (vault_id: VaultId) => void;
    on_remove_vault: (vault_id: VaultId) => void;
    on_open_settings: () => void;
    on_open_help: () => void;
  }

  let {
    recent_vaults,
    pinned_vault_ids,
    is_loading = false,
    error = null,
    app_version,
    on_choose_vault_dir,
    on_select_vault,
    on_toggle_pin_vault,
    on_remove_vault,
    on_open_settings,
    on_open_help,
  }: Props = $props();

  let vault_query = $state("");
  let selected_vault_index = $state(0);
  let search_input_ref: HTMLInputElement | null = $state(null);

  const filtered_recent_vaults = $derived(
    search_vaults(recent_vaults, vault_query),
  );

  const pinned_ids_set = $derived(new Set(pinned_vault_ids));

  const pinned_vaults = $derived(
    filtered_recent_vaults.filter((v) => pinned_ids_set.has(v.id)),
  );

  const unpinned_vaults = $derived(
    filtered_recent_vaults.filter((v) => !pinned_ids_set.has(v.id)),
  );

  const duplicate_names = $derived(duplicate_vault_names(recent_vaults));

  $effect(() => {
    selected_vault_index = clamp_vault_selection(
      selected_vault_index,
      filtered_recent_vaults.length,
    );
  });

  onMount(() => {
    setTimeout(() => search_input_ref?.focus(), 0);
  });

  function handle_select_vault(vault: Vault) {
    if (is_loading || !is_vault_available(vault)) {
      return;
    }
    on_select_vault(vault.id);
  }

  function open_selected_vault() {
    const selected_vault = filtered_recent_vaults[selected_vault_index];
    if (!selected_vault) {
      return;
    }
    handle_select_vault(selected_vault);
  }

  function handle_search_keydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selected_vault_index = move_vault_selection(
        selected_vault_index,
        filtered_recent_vaults.length,
        1,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      selected_vault_index = move_vault_selection(
        selected_vault_index,
        filtered_recent_vaults.length,
        -1,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      open_selected_vault();
      return;
    }
    if (event.key === "Escape" && vault_query !== "") {
      event.preventDefault();
      vault_query = "";
      selected_vault_index = 0;
    }
  }
</script>

<div class="VaultLauncher">
  <aside class="VaultLauncher__rail">
    <div class="VaultLauncher__brand">
      <div class="VaultLauncher__brandmark" aria-hidden="true">C</div>
      <div class="VaultLauncher__wordmark">Carbide</div>
      {#if app_version}
        <div
          class="VaultLauncher__version"
          data-testid="vault-launcher-version"
        >
          v{app_version}
        </div>
      {/if}
    </div>
    <div class="VaultLauncher__rail-actions">
      <Button
        onclick={on_choose_vault_dir}
        disabled={is_loading}
        class="VaultLauncher__choose-btn"
      >
        <FolderOpen />
        Open Folder…
      </Button>
    </div>
    <div class="VaultLauncher__rail-foot">
      <button
        type="button"
        class="VaultLauncher__rail-link"
        onclick={on_open_settings}
        disabled={is_loading}
      >
        <Settings />
        Settings
      </button>
      <button
        type="button"
        class="VaultLauncher__rail-link"
        onclick={on_open_help}
        disabled={is_loading}
      >
        <CircleHelp />
        Help
      </button>
    </div>
  </aside>

  <section class="VaultLauncher__main">
    <div class="VaultLauncher__content">
      {#if error}
        <div class="VaultLauncher__error" data-testid="vault-launcher-error">
          {error}
        </div>
      {/if}

      {#if recent_vaults.length > 0}
        <div class="VaultLauncher__search">
          <Input
            bind:ref={search_input_ref}
            type="text"
            value={vault_query}
            oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
              vault_query = event.currentTarget.value;
              selected_vault_index = 0;
            }}
            onkeydown={handle_search_keydown}
            placeholder="Search vaults..."
            aria-label="Search vaults"
          />
        </div>
        <div class="VaultLauncher__sections">
          {#if pinned_vaults.length > 0}
            <div class="VaultLauncher__section">
              <h3 class="VaultLauncher__section-title">
                <Pin class="VaultLauncher__section-icon" />
                Pinned
              </h3>
              <div class="VaultLauncher__list">
                {#each pinned_vaults as vault (vault.id)}
                  {@render vault_row(vault)}
                {/each}
              </div>
            </div>
          {/if}

          {#if unpinned_vaults.length > 0}
            <div class="VaultLauncher__section">
              <h3 class="VaultLauncher__section-title">Recent</h3>
              <div class="VaultLauncher__list">
                {#each unpinned_vaults as vault (vault.id)}
                  {@render vault_row(vault)}
                {/each}
              </div>
            </div>
          {/if}

          {#if filtered_recent_vaults.length === 0}
            <div class="VaultLauncher__empty-filter">
              No vaults match your search
            </div>
          {/if}
        </div>
        <div class="VaultLauncher__hintbar">
          <span class="VaultLauncher__hint">
            <kbd class="VaultLauncher__kbd">↑</kbd>
            <kbd class="VaultLauncher__kbd">↓</kbd>
            navigate
          </span>
          <span class="VaultLauncher__hint">
            <kbd class="VaultLauncher__kbd">↵</kbd>
            open
          </span>
          <span class="VaultLauncher__hint-count">
            {recent_vaults.length}
            {recent_vaults.length === 1 ? "vault" : "vaults"}
          </span>
        </div>
      {:else}
        <div class="VaultLauncher__empty" data-testid="vault-launcher-empty">
          <div class="VaultLauncher__empty-glyph" aria-hidden="true">
            <FolderOpen />
          </div>
          <h2 class="VaultLauncher__empty-title">Your notes live in a vault</h2>
          <p class="VaultLauncher__empty-desc">
            A vault is a folder of Markdown files on your disk. Point Carbide at
            one to get started.
          </p>
          <Button onclick={on_choose_vault_dir} disabled={is_loading}>
            <FolderOpen />
            Open Folder…
          </Button>
        </div>
      {/if}
    </div>
  </section>
</div>

{#snippet vault_row(vault: Vault)}
  {@const index = filtered_recent_vaults.indexOf(vault)}
  {@const available = is_vault_available(vault)}
  {@const pinned = pinned_ids_set.has(vault.id)}
  <div
    class="VaultLauncher__row"
    class:VaultLauncher__row--highlighted={index === selected_vault_index}
    class:VaultLauncher__row--unavailable={!available}
    data-disabled={is_loading || !available}
    data-testid="vault-launcher-row"
  >
    <button
      type="button"
      onclick={() => {
        handle_select_vault(vault);
      }}
      onmouseenter={() => {
        selected_vault_index = index;
      }}
      disabled={is_loading || !available}
      class="VaultLauncher__row-btn"
    >
      <span class="VaultLauncher__row-icon" aria-hidden="true">
        {vault_initial(vault.name)}
      </span>
      <span class="VaultLauncher__row-info">
        <span class="VaultLauncher__row-name-line">
          <span class="VaultLauncher__row-name">{vault.name}</span>
          {#if pinned}
            <Pin class="VaultLauncher__row-pin" aria-hidden="true" />
          {/if}
          {#if vault.mode === "browse"}
            <span class="VaultLauncher__badge VaultLauncher__badge--browse">
              Browse
            </span>
          {/if}
          {#if !available}
            <span
              class="VaultLauncher__badge VaultLauncher__badge--unavailable"
            >
              Unavailable
            </span>
          {/if}
        </span>
        <span
          class="VaultLauncher__row-path"
          class:VaultLauncher__row-path--disambiguated={duplicate_names.has(
            vault.name,
          )}
        >
          {format_vault_path(vault.path, vault.name, duplicate_names)}
        </span>
      </span>
      <span
        class="VaultLauncher__row-meta"
        class:VaultLauncher__row-meta--dimmed={!available}
      >
        <span>{format_note_count(vault)}</span>
        <span class="VaultLauncher__row-meta-time"
          >{format_last_opened(vault, Date.now())}</span
        >
      </span>
    </button>
    <div class="VaultLauncher__row-actions">
      <button
        type="button"
        class="VaultLauncher__icon-btn"
        class:VaultLauncher__icon-btn--active={pinned}
        onclick={() => {
          on_toggle_pin_vault(vault.id);
        }}
        disabled={is_loading}
        aria-label={pinned ? "Unpin vault" : "Pin vault"}
      >
        <Pin />
      </button>
      <button
        type="button"
        class="VaultLauncher__icon-btn"
        onclick={() => {
          on_remove_vault(vault.id);
        }}
        disabled={is_loading}
        aria-label="Remove vault from list"
      >
        <Trash2 />
      </button>
    </div>
  </div>
{/snippet}

<style>
  .VaultLauncher {
    display: grid;
    grid-template-columns: 17.5rem minmax(0, 1fr);
    height: 100dvh;
  }

  .VaultLauncher__rail {
    display: flex;
    flex-direction: column;
    background-color: var(--sidebar);
    border-right: 1px solid var(--sidebar-border);
    padding: var(--space-10) var(--space-6) var(--space-6);
  }

  .VaultLauncher__brand {
    display: flex;
    flex-direction: column;
  }

  .VaultLauncher__brandmark {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: var(--radius-lg);
    background: linear-gradient(
      135deg,
      var(--interactive),
      var(--interactive-hover)
    );
    color: var(--primary-foreground);
    font-size: var(--text-xl);
    font-weight: 700;
    margin-bottom: var(--space-4);
  }

  .VaultLauncher__wordmark {
    font-size: var(--text-xl);
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--foreground);
  }

  .VaultLauncher__version {
    margin-top: var(--space-1);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--foreground-tertiary);
  }

  .VaultLauncher__rail-actions {
    margin-top: var(--space-8);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  :global(.VaultLauncher__choose-btn) {
    width: 100%;
    justify-content: flex-start;
  }

  .VaultLauncher__rail-foot {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .VaultLauncher__rail-link {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1-5) var(--space-1);
    border: 0;
    background: transparent;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    text-align: left;
    transition: color var(--duration-fast) var(--ease-default);
  }

  .VaultLauncher__rail-link:hover:not(:disabled) {
    color: var(--foreground);
  }

  .VaultLauncher__rail-link:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .VaultLauncher__rail-link:disabled {
    opacity: 0.5;
  }

  :global(.VaultLauncher__rail-link svg) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }

  .VaultLauncher__main {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }

  .VaultLauncher__content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 44rem;
    margin-inline: auto;
    padding: var(--space-10) var(--space-8) var(--space-4);
  }

  .VaultLauncher__error {
    margin-bottom: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background-color: var(--card);
    font-size: var(--text-base);
    color: var(--destructive);
  }

  .VaultLauncher__search {
    margin-bottom: var(--space-5);
  }

  .VaultLauncher__sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-right: var(--space-1);
  }

  .VaultLauncher__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .VaultLauncher__section-title {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    padding-left: var(--space-2);
  }

  :global(.VaultLauncher__section-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    opacity: 0.7;
  }

  .VaultLauncher__list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .VaultLauncher__empty-filter {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    padding-left: var(--space-2);
  }

  .VaultLauncher__row {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .VaultLauncher__row--highlighted {
    background-color: color-mix(in oklch, var(--interactive) 10%, transparent);
  }

  .VaultLauncher__row[data-disabled="true"] {
    cursor: not-allowed;
  }

  .VaultLauncher__row--unavailable {
    opacity: 0.55;
  }

  .VaultLauncher__row-btn {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: inherit;
    padding: 0;
    text-align: left;
  }

  .VaultLauncher__row-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
    border-radius: var(--radius-md);
  }

  .VaultLauncher__row-icon {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 2.125rem;
    height: 2.125rem;
    border-radius: var(--radius-md);
    background-color: var(--background-surface-3);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .VaultLauncher__row--highlighted .VaultLauncher__row-icon {
    background-color: var(--interactive);
    color: var(--primary-foreground);
  }

  .VaultLauncher__row-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .VaultLauncher__row-name-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .VaultLauncher__row-name {
    font-size: var(--text-base);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.VaultLauncher__row-pin) {
    flex-shrink: 0;
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    color: var(--interactive);
  }

  .VaultLauncher__badge {
    flex-shrink: 0;
    font-size: var(--text-xs);
    font-weight: 500;
    line-height: 1.4;
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: var(--radius-sm);
  }

  .VaultLauncher__badge--unavailable {
    color: var(--destructive);
    background-color: color-mix(in oklch, var(--destructive) 10%, transparent);
    border: 1px solid color-mix(in oklch, var(--destructive) 20%, transparent);
  }

  .VaultLauncher__badge--browse {
    color: var(--muted-foreground);
    background-color: color-mix(in oklch, var(--muted) 60%, transparent);
    border: 1px solid var(--border);
  }

  .VaultLauncher__row-path {
    margin-top: var(--space-0-5);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--foreground-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .VaultLauncher__row-path--disambiguated {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: break-word;
  }

  .VaultLauncher__row-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .VaultLauncher__row-meta--dimmed {
    opacity: 0.6;
  }

  .VaultLauncher__row-meta-time {
    color: var(--foreground-tertiary);
  }

  .VaultLauncher__row-actions {
    display: flex;
    align-items: center;
    gap: var(--space-0-5);
  }

  .VaultLauncher__icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-sm);
    height: var(--size-touch-sm);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--muted-foreground);
    transition:
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default),
      border-color var(--duration-fast) var(--ease-default);
  }

  .VaultLauncher__icon-btn:hover:not(:disabled) {
    color: var(--foreground);
    background-color: var(--muted);
  }

  .VaultLauncher__icon-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .VaultLauncher__icon-btn--active {
    color: var(--interactive);
  }

  .VaultLauncher__icon-btn:disabled {
    opacity: 0.5;
  }

  :global(.VaultLauncher__icon-btn svg) {
    width: var(--size-icon);
    height: var(--size-icon);
  }

  .VaultLauncher__hintbar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border-subtle);
    font-size: var(--text-xs);
    color: var(--foreground-tertiary);
  }

  .VaultLauncher__hint {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .VaultLauncher__hint-count {
    margin-left: auto;
  }

  .VaultLauncher__kbd {
    display: inline-block;
    padding: 0 var(--space-1-5);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
    background-color: var(--card);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: 1.5;
    color: var(--muted-foreground);
  }

  .VaultLauncher__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    padding: var(--space-8);
  }

  .VaultLauncher__empty-glyph {
    display: grid;
    place-items: center;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: var(--radius-xl);
    background-color: var(--accent);
    color: var(--accent-foreground);
    margin-bottom: var(--space-5);
  }

  :global(.VaultLauncher__empty-glyph svg) {
    width: var(--size-icon-lg);
    height: var(--size-icon-lg);
  }

  .VaultLauncher__empty-title {
    margin-bottom: var(--space-2);
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--foreground);
  }

  .VaultLauncher__empty-desc {
    max-width: 40ch;
    margin-bottom: var(--space-5);
    font-size: var(--text-base);
    color: var(--muted-foreground);
  }

  @media (max-width: 45rem) {
    .VaultLauncher {
      grid-template-columns: minmax(0, 1fr);
      height: auto;
      min-height: 100dvh;
    }

    .VaultLauncher__rail {
      flex-direction: row;
      align-items: center;
      gap: var(--space-4);
      border-right: 0;
      border-bottom: 1px solid var(--sidebar-border);
      padding: var(--space-4) var(--space-6);
    }

    .VaultLauncher__rail-actions {
      margin-top: 0;
      margin-left: auto;
    }

    .VaultLauncher__rail-foot {
      display: none;
    }
  }
</style>
