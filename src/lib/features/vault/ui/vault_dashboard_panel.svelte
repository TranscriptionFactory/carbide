<script lang="ts">
  import {
    FileText,
    Folder,
    FilePlus,
    Search,
    RefreshCw,
    Tag,
    GitBranch,
    CheckCircle,
    Circle,
    Loader,
  } from "@lucide/svelte";
  import { format_relative_time } from "$lib/shared/utils/relative_time";
  import { format_bytes } from "$lib/shared/utils/format_bytes";
  import type { NoteMeta } from "$lib/shared/types/note";
  import type { TaskStatus } from "$lib/features/task";
  import type { TagInfo } from "$lib/features/tags";

  type TaskCounts = Record<TaskStatus, number>;

  type Props = {
    stats_status: "idle" | "loading" | "ready" | "error";
    note_count: number | null;
    folder_count: number | null;
    recent_notes: NoteMeta[];
    vault_name: string;
    vault_path: string;
    on_note_click: (path: string) => void;
    on_new_note: () => void;
    on_search: () => void;
    on_reindex: () => void;
    task_counts: TaskCounts | null;
    git_enabled: boolean;
    git_branch: string;
    git_is_dirty: boolean;
    git_pending_files: number;
    tags: TagInfo[];
    on_tag_click: (tag: string) => void;
  };

  let {
    stats_status,
    note_count,
    folder_count,
    recent_notes,
    vault_name,
    vault_path,
    on_note_click,
    on_new_note,
    on_search,
    on_reindex,
    task_counts,
    git_enabled,
    git_branch,
    git_is_dirty,
    git_pending_files,
    tags,
    on_tag_click,
  }: Props = $props();

  const now_ms = Date.now();

  const display_notes = $derived(recent_notes.slice(0, 8));

  const total_size_bytes = $derived(
    recent_notes.reduce((sum, note) => sum + note.size_bytes, 0),
  );

  const stats_loading = $derived(
    stats_status === "loading" || stats_status === "idle",
  );

  const notes_display = $derived(
    note_count === null || stats_loading ? "—" : String(note_count),
  );

  const folders_display = $derived(
    folder_count === null || stats_loading ? "—" : String(folder_count),
  );

  const top_tags = $derived(
    [...tags].sort((a, b) => b.count - a.count).slice(0, 5),
  );

  const total_tasks = $derived(
    task_counts ? task_counts.todo + task_counts.doing + task_counts.done : 0,
  );
</script>

<div class="DashboardPanel">
  <section class="DashboardPanel__section">
    <h3 class="DashboardPanel__section-title">Overview</h3>
    <div class="DashboardPanel__cards">
      <div class="DashboardPanel__card">
        <FileText class="DashboardPanel__card-icon" />
        <div class="DashboardPanel__card-body">
          <span class="DashboardPanel__card-value">{notes_display}</span>
          <span class="DashboardPanel__card-label">Notes</span>
        </div>
      </div>
      <div class="DashboardPanel__card">
        <Folder class="DashboardPanel__card-icon" />
        <div class="DashboardPanel__card-body">
          <span class="DashboardPanel__card-value">{folders_display}</span>
          <span class="DashboardPanel__card-label">Folders</span>
        </div>
      </div>
    </div>
  </section>

  {#if task_counts && total_tasks > 0}
    <section class="DashboardPanel__section">
      <h3 class="DashboardPanel__section-title">Tasks</h3>
      <div class="DashboardPanel__task-row">
        <div class="DashboardPanel__task-item">
          <Circle
            class="DashboardPanel__task-icon DashboardPanel__task-icon--todo"
          />
          <span class="DashboardPanel__task-count">{task_counts.todo}</span>
          <span class="DashboardPanel__task-label">Todo</span>
        </div>
        <div class="DashboardPanel__task-item">
          <Loader
            class="DashboardPanel__task-icon DashboardPanel__task-icon--doing"
          />
          <span class="DashboardPanel__task-count">{task_counts.doing}</span>
          <span class="DashboardPanel__task-label">In Progress</span>
        </div>
        <div class="DashboardPanel__task-item">
          <CheckCircle
            class="DashboardPanel__task-icon DashboardPanel__task-icon--done"
          />
          <span class="DashboardPanel__task-count">{task_counts.done}</span>
          <span class="DashboardPanel__task-label">Done</span>
        </div>
      </div>
    </section>
  {/if}

  {#if git_enabled}
    <section class="DashboardPanel__section">
      <h3 class="DashboardPanel__section-title">Git</h3>
      <div class="DashboardPanel__git-status">
        <div class="DashboardPanel__git-branch">
          <GitBranch class="DashboardPanel__git-icon" />
          <span class="DashboardPanel__git-branch-name"
            >{git_branch || "—"}</span
          >
          <span
            class="DashboardPanel__git-indicator"
            class:DashboardPanel__git-indicator--clean={!git_is_dirty}
            class:DashboardPanel__git-indicator--dirty={git_is_dirty}
          >
            {git_is_dirty ? "dirty" : "clean"}
          </span>
        </div>
        {#if git_pending_files > 0}
          <span class="DashboardPanel__git-pending">
            {git_pending_files} pending {git_pending_files === 1
              ? "file"
              : "files"}
          </span>
        {/if}
      </div>
    </section>
  {/if}

  <section class="DashboardPanel__section">
    <h3 class="DashboardPanel__section-title">Recent Notes</h3>
    {#if display_notes.length > 0}
      <ul class="DashboardPanel__recent-list">
        {#each display_notes as note (note.id)}
          <li>
            <button
              type="button"
              class="DashboardPanel__recent-item"
              onclick={() => on_note_click(note.path)}
            >
              <span class="DashboardPanel__recent-name">{note.title}</span>
              <span class="DashboardPanel__recent-time">
                {format_relative_time(note.mtime_ms, now_ms)}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="DashboardPanel__empty">No recent notes yet</p>
    {/if}
  </section>

  <section class="DashboardPanel__section">
    <h3 class="DashboardPanel__section-title">Quick Actions</h3>
    <div class="DashboardPanel__actions">
      <button
        type="button"
        class="DashboardPanel__action-button"
        onclick={on_new_note}
      >
        <FilePlus class="DashboardPanel__action-icon" />
        <span>New Note</span>
      </button>
      <button
        type="button"
        class="DashboardPanel__action-button"
        onclick={on_search}
      >
        <Search class="DashboardPanel__action-icon" />
        <span>Search Vault</span>
      </button>
      <button
        type="button"
        class="DashboardPanel__action-button"
        onclick={on_reindex}
      >
        <RefreshCw class="DashboardPanel__action-icon" />
        <span>Reindex Vault</span>
      </button>
      <button type="button" class="DashboardPanel__action-button" disabled>
        <Tag class="DashboardPanel__action-icon" />
        <span>View Tags</span>
      </button>
    </div>
  </section>

  {#if top_tags.length > 0}
    <section class="DashboardPanel__section">
      <h3 class="DashboardPanel__section-title">Top Tags</h3>
      <div class="DashboardPanel__tags">
        {#each top_tags as tag_info (tag_info.tag)}
          <button
            type="button"
            class="DashboardPanel__tag-pill"
            onclick={() => on_tag_click(tag_info.tag)}
          >
            <span class="DashboardPanel__tag-name">{tag_info.tag}</span>
            <span class="DashboardPanel__tag-count">{tag_info.count}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <section class="DashboardPanel__section DashboardPanel__section--info">
    <h3 class="DashboardPanel__section-title">Vault Info</h3>
    <dl class="DashboardPanel__info-list">
      <div class="DashboardPanel__info-row">
        <dt class="DashboardPanel__info-label">Name</dt>
        <dd class="DashboardPanel__info-value">{vault_name}</dd>
      </div>
      <div class="DashboardPanel__info-row">
        <dt class="DashboardPanel__info-label">Path</dt>
        <dd class="DashboardPanel__info-value DashboardPanel__info-value--mono">
          {vault_path}
        </dd>
      </div>
      {#if total_size_bytes > 0}
        <div class="DashboardPanel__info-row">
          <dt class="DashboardPanel__info-label">Recent Size</dt>
          <dd class="DashboardPanel__info-value">
            {format_bytes(total_size_bytes)}
          </dd>
        </div>
      {/if}
    </dl>
  </section>
</div>

<style>
  .DashboardPanel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-3);
    overflow-y: auto;
    height: 100%;
  }

  .DashboardPanel__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .DashboardPanel__section-title {
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    padding-inline: var(--space-1);
  }

  .DashboardPanel__cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  .DashboardPanel__card {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    background-color: var(--muted);
    border: 1px solid var(--border);
  }

  :global(.DashboardPanel__card-icon) {
    width: var(--size-icon);
    height: var(--size-icon);
    color: var(--interactive);
    flex-shrink: 0;
  }

  .DashboardPanel__card-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .DashboardPanel__card-value {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--foreground);
    line-height: 1.2;
  }

  .DashboardPanel__card-label {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    line-height: 1.2;
  }

  .DashboardPanel__recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .DashboardPanel__recent-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1-5) var(--space-2);
    border-radius: var(--radius);
    font-size: var(--text-sm);
    color: var(--foreground);
    text-align: left;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .DashboardPanel__recent-item:hover {
    background-color: var(--sidebar-accent);
    color: var(--foreground);
  }

  .DashboardPanel__recent-item:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .DashboardPanel__recent-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .DashboardPanel__recent-time {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .DashboardPanel__empty {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    padding: var(--space-3) var(--space-2);
    text-align: center;
  }

  .DashboardPanel__actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
  }

  .DashboardPanel__action-button {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1-5) var(--space-2);
    border-radius: var(--radius);
    font-size: var(--text-sm);
    color: var(--foreground);
    text-align: left;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .DashboardPanel__action-button:hover:not(:disabled) {
    background-color: var(--sidebar-accent);
  }

  .DashboardPanel__action-button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .DashboardPanel__action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.DashboardPanel__action-icon) {
    width: var(--size-icon);
    height: var(--size-icon);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .DashboardPanel__section--info {
    margin-top: auto;
    padding-top: var(--space-2);
    border-top: 1px solid var(--border);
  }

  .DashboardPanel__info-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .DashboardPanel__info-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    padding-inline: var(--space-1);
  }

  .DashboardPanel__info-label {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .DashboardPanel__info-value {
    font-size: var(--text-xs);
    color: var(--foreground);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .DashboardPanel__info-value--mono {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.625rem;
  }

  /* Tasks */
  .DashboardPanel__task-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: var(--space-2);
  }

  .DashboardPanel__task-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-0-5);
    padding: var(--space-2) var(--space-1);
    border-radius: var(--radius);
    background-color: var(--muted);
    border: 1px solid var(--border);
  }

  :global(.DashboardPanel__task-icon) {
    width: var(--size-icon);
    height: var(--size-icon);
    flex-shrink: 0;
  }

  :global(.DashboardPanel__task-icon--todo) {
    color: var(--muted-foreground);
  }

  :global(.DashboardPanel__task-icon--doing) {
    color: var(--warning, hsl(38 92% 50%));
  }

  :global(.DashboardPanel__task-icon--done) {
    color: var(--success, hsl(142 71% 45%));
  }

  .DashboardPanel__task-count {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--foreground);
    line-height: 1.2;
  }

  .DashboardPanel__task-label {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    line-height: 1.2;
  }

  /* Git */
  .DashboardPanel__git-status {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius);
    background-color: var(--muted);
    border: 1px solid var(--border);
  }

  .DashboardPanel__git-branch {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  :global(.DashboardPanel__git-icon) {
    width: var(--size-icon);
    height: var(--size-icon);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .DashboardPanel__git-branch-name {
    font-size: var(--text-sm);
    font-family: var(--font-mono, ui-monospace, monospace);
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .DashboardPanel__git-indicator {
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 1px var(--space-1-5);
    border-radius: var(--radius-full, 9999px);
    flex-shrink: 0;
    margin-left: auto;
  }

  .DashboardPanel__git-indicator--clean {
    background-color: hsl(142 71% 45% / 0.15);
    color: var(--success, hsl(142 71% 45%));
  }

  .DashboardPanel__git-indicator--dirty {
    background-color: hsl(38 92% 50% / 0.15);
    color: var(--warning, hsl(38 92% 50%));
  }

  .DashboardPanel__git-pending {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    padding-left: calc(var(--size-icon) + var(--space-2));
  }

  /* Tags */
  .DashboardPanel__tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .DashboardPanel__tag-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full, 9999px);
    font-size: var(--text-xs);
    background-color: var(--muted);
    border: 1px solid var(--border);
    color: var(--foreground);
    transition:
      background-color var(--duration-fast) var(--ease-default),
      border-color var(--duration-fast) var(--ease-default);
  }

  .DashboardPanel__tag-pill:hover {
    background-color: var(--sidebar-accent);
    border-color: var(--interactive);
  }

  .DashboardPanel__tag-pill:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .DashboardPanel__tag-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 10ch;
  }

  .DashboardPanel__tag-count {
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }
</style>
