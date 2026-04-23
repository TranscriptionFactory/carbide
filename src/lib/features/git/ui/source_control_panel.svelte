<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import ChangeCard from "./change_card.svelte";
  import CheckpointHistory from "./checkpoint_history.svelte";
  import CommitComposer from "./commit_composer.svelte";
  import {
    ChevronDown,
    ChevronRight,
    GitBranch,
    ArrowDown,
    ArrowUp,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  const { stores, action_registry } = use_app_context();

  let staged_open = $state(true);
  let changes_open = $state(true);
  let history_open = $state(false);

  const staged_files = $derived(stores.git.staged_files);
  const unstaged_files = $derived(stores.git.unstaged_files);
  const changed_files = $derived(stores.git.changed_files);

  const stat_additions = $derived(
    changed_files.filter(
      (f) => f.status === "added" || f.status === "untracked",
    ).length,
  );
  const stat_deletions = $derived(
    changed_files.filter((f) => f.status === "deleted").length,
  );

  function toggle_stage(path: string) {
    stores.git.toggle_stage(path);
  }

  function stage_all() {
    void action_registry.execute(ACTION_IDS.git_stage_all);
  }

  function unstage_all() {
    void action_registry.execute(ACTION_IDS.git_unstage_all);
  }

  function handle_commit(message: string) {
    void action_registry.execute(ACTION_IDS.git_commit_staged, { message });
  }

  function load_more_history() {
    void action_registry.execute(ACTION_IDS.git_load_more_history);
  }

  onMount(() => {
    void action_registry.execute(ACTION_IDS.git_refresh_status);
    void action_registry.execute(ACTION_IDS.git_open_history);
  });
</script>

<div class="SourceControlPanel">
  <div class="SourceControlPanel__header">
    <div class="SourceControlPanel__branch">
      <GitBranch class="SourceControlPanel__branch-icon" />
      <span class="SourceControlPanel__branch-name">{stores.git.branch}</span>
    </div>
    {#if stores.git.has_remote}
      <div class="SourceControlPanel__sync-badges">
        {#if stores.git.behind > 0}
          <span class="SourceControlPanel__badge">
            <ArrowDown class="SourceControlPanel__badge-icon" />
            {stores.git.behind}
          </span>
        {/if}
        {#if stores.git.ahead > 0}
          <span class="SourceControlPanel__badge">
            <ArrowUp class="SourceControlPanel__badge-icon" />
            {stores.git.ahead}
          </span>
        {/if}
      </div>
    {/if}
  </div>

  <div class="SourceControlPanel__stats">
    <span class="SourceControlPanel__stat">
      {changed_files.length} file{changed_files.length !== 1 ? "s" : ""}
    </span>
    <span class="SourceControlPanel__stat">
      {staged_files.length} staged
    </span>
    {#if stat_additions > 0}
      <span class="SourceControlPanel__stat SourceControlPanel__stat--add">
        +{stat_additions}
      </span>
    {/if}
    {#if stat_deletions > 0}
      <span class="SourceControlPanel__stat SourceControlPanel__stat--del">
        −{stat_deletions}
      </span>
    {/if}
  </div>

  <div class="SourceControlPanel__scroll">
    {#if staged_files.length > 0}
      <div class="SourceControlPanel__section">
        <div class="SourceControlPanel__section-header">
          <button
            type="button"
            class="SourceControlPanel__section-toggle"
            onclick={() => (staged_open = !staged_open)}
          >
            {#if staged_open}
              <ChevronDown class="SourceControlPanel__chevron" />
            {:else}
              <ChevronRight class="SourceControlPanel__chevron" />
            {/if}
            <span>Staged ({staged_files.length})</span>
          </button>
          <button
            type="button"
            class="SourceControlPanel__section-action"
            onclick={unstage_all}
            aria-label="Unstage all"
          >
            Unstage All
          </button>
        </div>
        {#if staged_open}
          <div class="SourceControlPanel__file-list">
            {#each staged_files as file (file.path)}
              <ChangeCard
                {file}
                is_staged={true}
                on_toggle_stage={toggle_stage}
              />
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="SourceControlPanel__section">
      <div class="SourceControlPanel__section-header">
        <button
          type="button"
          class="SourceControlPanel__section-toggle"
          onclick={() => (changes_open = !changes_open)}
        >
          {#if changes_open}
            <ChevronDown class="SourceControlPanel__chevron" />
          {:else}
            <ChevronRight class="SourceControlPanel__chevron" />
          {/if}
          <span>Changes ({unstaged_files.length})</span>
        </button>
        {#if unstaged_files.length > 0}
          <button
            type="button"
            class="SourceControlPanel__section-action"
            onclick={stage_all}
            aria-label="Stage all"
          >
            Stage All
          </button>
        {/if}
      </div>
      {#if changes_open}
        <div class="SourceControlPanel__file-list">
          {#each unstaged_files as file (file.path)}
            <ChangeCard
              {file}
              is_staged={false}
              on_toggle_stage={toggle_stage}
            />
          {/each}
          {#if unstaged_files.length === 0}
            <div class="SourceControlPanel__empty">No unstaged changes</div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="SourceControlPanel__section">
      <div class="SourceControlPanel__section-header">
        <button
          type="button"
          class="SourceControlPanel__section-toggle"
          onclick={() => (history_open = !history_open)}
        >
          {#if history_open}
            <ChevronDown class="SourceControlPanel__chevron" />
          {:else}
            <ChevronRight class="SourceControlPanel__chevron" />
          {/if}
          <span>Checkpoints</span>
        </button>
      </div>
      {#if history_open}
        <CheckpointHistory
          commits={stores.git.history}
          has_more={stores.git.has_more_history}
          is_loading_more={stores.git.is_loading_more_history}
          on_load_more={load_more_history}
        />
      {/if}
    </div>
  </div>

  <CommitComposer
    staged_count={staged_files.length}
    on_commit={handle_commit}
  />
</div>

<style>
  .SourceControlPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .SourceControlPanel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-block-end: 1px solid var(--border);
  }

  .SourceControlPanel__branch {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
  }

  :global(.SourceControlPanel__branch-icon) {
    width: 14px;
    height: 14px;
    opacity: 0.7;
  }

  .SourceControlPanel__branch-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .SourceControlPanel__sync-badges {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .SourceControlPanel__badge {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: var(--text-2xs);
    font-family: var(--font-mono);
    color: var(--muted-foreground);
  }

  :global(.SourceControlPanel__badge-icon) {
    width: 10px;
    height: 10px;
  }

  .SourceControlPanel__stats {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-2xs);
    color: var(--muted-foreground);
    border-block-end: 1px solid var(--border);
  }

  .SourceControlPanel__stat--add {
    color: var(--indicator-clean);
  }

  .SourceControlPanel__stat--del {
    color: var(--destructive);
  }

  .SourceControlPanel__scroll {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .SourceControlPanel__section {
    border-block-end: 1px solid var(--border);
  }

  .SourceControlPanel__section-header {
    display: flex;
    align-items: center;
    padding-inline-end: var(--space-2);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .SourceControlPanel__section-header:hover {
    background-color: var(--accent);
  }

  .SourceControlPanel__section-toggle {
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

  :global(.SourceControlPanel__chevron) {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    opacity: 0.5;
  }

  .SourceControlPanel__section-action {
    margin-inline-start: auto;
    font-size: var(--text-2xs);
    font-weight: 400;
    color: var(--interactive);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .SourceControlPanel__section-header:hover
    .SourceControlPanel__section-action {
    opacity: 1;
  }

  .SourceControlPanel__file-list {
    display: flex;
    flex-direction: column;
  }

  .SourceControlPanel__empty {
    padding: var(--space-3);
    text-align: center;
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }
</style>
