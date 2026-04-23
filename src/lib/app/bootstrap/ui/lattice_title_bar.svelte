<script lang="ts">
  import { GitBranch } from "@lucide/svelte";

  type Props = {
    vault_name: string;
    note_title: string | null;
    branch: string;
    on_branch_click: () => void;
  };

  let { vault_name, note_title, branch, on_branch_click }: Props = $props();
</script>

<div class="LatticeTitleBar" data-tauri-drag-region>
  <div class="LatticeTitleBar__breadcrumbs">
    <span class="LatticeTitleBar__vault">{vault_name}</span>
    {#if note_title}
      <span class="LatticeTitleBar__separator">/</span>
      <span class="LatticeTitleBar__note">{note_title}</span>
    {/if}
  </div>
  <button
    type="button"
    class="LatticeTitleBar__branch"
    onclick={on_branch_click}
  >
    <GitBranch class="LatticeTitleBar__branch-icon" />
    {branch}
  </button>
</div>

<style>
  .LatticeTitleBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 36px;
    padding-inline: var(--space-3);
    background-color: var(--background-surface-2, var(--sidebar));
    border-block-end: 1px solid var(--border);
    -webkit-app-region: drag;
  }

  .LatticeTitleBar__breadcrumbs {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    min-width: 0;
    overflow: hidden;
    -webkit-app-region: no-drag;
  }

  .LatticeTitleBar__vault {
    font-weight: 500;
    color: var(--foreground);
    white-space: nowrap;
  }

  .LatticeTitleBar__separator {
    opacity: 0.3;
  }

  .LatticeTitleBar__note {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .LatticeTitleBar__branch {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-2xs);
    font-family: var(--font-mono);
    color: var(--muted-foreground);
    padding: var(--space-0-5) var(--space-1-5);
    border-radius: var(--radius-sm);
    -webkit-app-region: no-drag;
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .LatticeTitleBar__branch:hover {
    background-color: var(--accent);
    color: var(--foreground);
  }

  :global(.LatticeTitleBar__branch-icon) {
    width: 12px;
    height: 12px;
  }
</style>
