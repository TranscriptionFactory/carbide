<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import ChangeCard from "./change_card.svelte";
  import CheckpointHistory from "./checkpoint_history.svelte";
  import CommitComposer from "./commit_composer.svelte";
  import CollapsibleSection from "$lib/components/ui/collapsible_section.svelte";
  import { GitBranch, ArrowDown, ArrowUp } from "@lucide/svelte";
  import { onMount } from "svelte";

  const { stores, action_registry } = use_app_context();

  let staged_open = $state(true);
  let changes_open = $state(true);
  let history_open = $state(false);

  const staged_files = $derived(stores.git.staged_files);
  const unstaged_files = $derived(stores.git.unstaged_files);
  const changed_files = $derived(stores.git.changed_files);

  const stats = $derived.by(() => {
    let additions = 0;
    let deletions = 0;
    for (const f of changed_files) {
      if (f.status === "added" || f.status === "untracked") additions++;
      else if (f.status === "deleted") deletions++;
    }
    return { additions, deletions };
  });

  let history_loaded = false;

  function toggle_stage(path: string) {
    void action_registry.execute(ACTION_IDS.git_toggle_stage, path);
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

  function open_history() {
    history_open = !history_open;
    if (history_open && !history_loaded) {
      history_loaded = true;
      void action_registry.execute(ACTION_IDS.git_open_history);
    }
  }

  onMount(() => {
    void action_registry.execute(ACTION_IDS.git_refresh_status);
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
    {#if stats.additions > 0}
      <span class="SourceControlPanel__stat SourceControlPanel__stat--add">
        +{stats.additions}
      </span>
    {/if}
    {#if stats.deletions > 0}
      <span class="SourceControlPanel__stat SourceControlPanel__stat--del">
        −{stats.deletions}
      </span>
    {/if}
  </div>

  <div class="SourceControlPanel__scroll">
    {#if staged_files.length > 0}
      <CollapsibleSection
        title="Staged"
        count={staged_files.length}
        open={staged_open}
        action_label="Unstage All"
        on_toggle={() => (staged_open = !staged_open)}
        on_action={unstage_all}
      >
        <div class="SourceControlPanel__file-list">
          {#each staged_files as file (file.path)}
            <ChangeCard
              {file}
              is_staged={true}
              on_toggle_stage={toggle_stage}
            />
          {/each}
        </div>
      </CollapsibleSection>
    {/if}

    <CollapsibleSection
      title="Changes"
      count={unstaged_files.length}
      open={changes_open}
      action_label={unstaged_files.length > 0 ? "Stage All" : undefined}
      on_toggle={() => (changes_open = !changes_open)}
      on_action={unstaged_files.length > 0 ? stage_all : undefined}
    >
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
    </CollapsibleSection>

    <CollapsibleSection
      title="Checkpoints"
      open={history_open}
      on_toggle={open_history}
    >
      <CheckpointHistory
        commits={stores.git.history}
        has_more={stores.git.has_more_history}
        is_loading_more={stores.git.is_loading_more_history}
        on_load_more={load_more_history}
      />
    </CollapsibleSection>
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
