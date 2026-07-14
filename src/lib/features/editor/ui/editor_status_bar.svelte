<script lang="ts">
  import {
    ChevronsLeftRight,
    ChevronsRightLeft,
    Info,
    FolderOpen,
    RefreshCw,
    ShieldCheck,
    ShieldAlert,
    Shield,
    Terminal,
    CircleAlert,
    Zap,
    Search,
    Bot,
  } from "@lucide/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { GitStatusWidget } from "$lib/features/git";
  import { LintStatusIndicator } from "$lib/features/lint";
  import { format_relative_time } from "$lib/shared/utils/relative_time";
  import type { CursorInfo } from "$lib/shared/types/editor";
  import type { IndexProgress } from "$lib/features/search";
  import type { GitSyncStatus } from "$lib/features/git";
  import type { StatusBarItem } from "$lib/features/plugin";
  import type { TrustLevel } from "$lib/features/document";
  import { VimNavStatusIndicator } from "$lib/features/vim_nav";
  import type { NavContext } from "$lib/features/vim_nav";
  // STT removed — archived on archive/stt-main
  // import { SttStatusIndicator } from "$lib/features/stt";

  type BottomPanelTab =
    | "terminal"
    | "problems"
    | "lsp_results"
    | "query"
    | "ai"
    | "trust";

  const PANEL_TABS: { id: BottomPanelTab; label: string; icon: typeof Info }[] =
    [
      { id: "terminal", label: "Terminal", icon: Terminal },
      { id: "problems", label: "Problems", icon: CircleAlert },
      { id: "lsp_results", label: "LSP", icon: Zap },
      { id: "query", label: "Query", icon: Search },
      { id: "ai", label: "AI Assistant", icon: Bot },
      { id: "trust", label: "Trust", icon: ShieldCheck },
    ];

  interface Props {
    cursor_info: CursorInfo | null;
    word_count: number;
    line_count: number;
    has_note: boolean;
    last_saved_at: number | null;
    index_progress: IndexProgress;
    is_reindex_pending: boolean;
    // structural copy of search's EmbeddingProgress; layering rules forbid a
    // deep import and the barrel does not export it yet
    embedding_progress: {
      status: "idle" | "embedding" | "completed" | "failed";
      embedded: number;
      total: number;
      error: string | null;
    };
    vault_name: string | null;
    git_enabled: boolean;
    git_branch: string;
    git_is_dirty: boolean;
    git_pending_files: number;
    git_sync_status: GitSyncStatus;
    git_has_remote: boolean;
    git_is_fetching: boolean;
    git_ahead: number;
    git_behind: number;
    is_repairing_links: boolean;
    link_repair_message: string | null;
    editor_mode: import("$lib/shared/types/editor").EditorMode;
    split_view: boolean;
    on_split_toggle: () => void;
    width_mode: import("$lib/shared/types/editor_settings").EditorWidthMode;
    on_width_toggle: () => void;
    lint_is_running: boolean;
    lint_error_count: number;
    lint_warning_count: number;
    on_lint_click: () => void;
    on_lint_format_click: () => void;
    status_bar_items?: StatusBarItem[];
    on_vault_click: () => void;
    on_info_click: () => void;
    on_git_click: () => void;
    on_git_fetch: () => void;
    on_git_push: () => void;
    on_git_pull: () => void;
    on_git_sync: () => void;
    on_git_add_remote: () => void;
    on_sync_click: () => void;
    on_mode_toggle: () => void;
    show_line_numbers: boolean;
    on_line_numbers_toggle: () => void;
    zoom_percent: number;
    on_zoom_reset: () => void;
    vim_nav_enabled: boolean;
    vim_nav_context: NavContext;
    vim_nav_pending_keys: string;
    on_vim_nav_cheatsheet: () => void;
    html_trust_level: TrustLevel | null;
    on_html_trust_click: () => void;
    bottom_panel_open: boolean;
    bottom_panel_tab: BottomPanelTab;
    on_panel_tab_click: (tab: BottomPanelTab) => void;
    // STT removed — archived on archive/stt-main
    // stt_enabled: boolean;
    // stt_recording_state: "idle" | "recording" | "processing";
    // stt_model_loading: boolean;
    // stt_has_model: boolean;
    // on_stt_click: () => void;
    // on_stt_settings_click: () => void;
  }

  let {
    cursor_info,
    word_count,
    line_count,
    has_note,
    last_saved_at,
    index_progress,
    is_reindex_pending,
    embedding_progress,
    vault_name,
    git_enabled,
    git_branch,
    git_is_dirty,
    git_pending_files,
    git_sync_status,
    git_has_remote,
    git_is_fetching,
    git_ahead,
    git_behind,
    is_repairing_links,
    link_repair_message,
    editor_mode,
    lint_is_running,
    lint_error_count,
    lint_warning_count,
    on_lint_click,
    on_lint_format_click,
    status_bar_items = [],
    on_vault_click,
    on_info_click,
    on_git_click,
    on_git_fetch,
    on_git_push,
    on_git_pull,
    on_git_sync,
    on_git_add_remote,
    on_sync_click,
    on_mode_toggle,
    split_view,
    on_split_toggle,
    width_mode,
    on_width_toggle,
    show_line_numbers,
    on_line_numbers_toggle,
    zoom_percent,
    on_zoom_reset,
    vim_nav_enabled,
    vim_nav_context,
    vim_nav_pending_keys,
    on_vim_nav_cheatsheet,
    html_trust_level,
    on_html_trust_click,
    bottom_panel_open,
    bottom_panel_tab,
    on_panel_tab_click,
    // stt_enabled,
    // stt_recording_state,
    // stt_model_loading,
    // stt_has_model,
    // on_stt_click,
    // on_stt_settings_click,
  }: Props = $props();

  const line = $derived(cursor_info?.line ?? null);
  const column = $derived(cursor_info?.column ?? null);
  const is_indexing = $derived(index_progress.status === "indexing");
  const show_index_counts = $derived(
    index_progress.total > 1 || index_progress.indexed > 0,
  );
  const sync_tooltip = $derived.by(() => {
    if (is_indexing) return "Indexing in progress…";
    if (index_progress.status === "failed")
      return "Last index failed — click to retry";
    return "Sync index";
  });

  let show_completed = $state(false);
  let completed_timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (index_progress.status === "completed") {
      show_completed = true;
      completed_timer = setTimeout(() => {
        show_completed = false;
      }, 3000);
    }
    return () => {
      if (completed_timer) {
        clearTimeout(completed_timer);
      }
    };
  });

  let tick = $state(Date.now());

  $effect(() => {
    if (!last_saved_at) return;
    tick = Date.now();
    const handle = setInterval(() => {
      tick = Date.now();
    }, 15_000);
    return () => clearInterval(handle);
  });

  const saved_label = $derived(
    last_saved_at ? `Saved ${format_relative_time(last_saved_at, tick)}` : null,
  );
</script>

<div class="StatusBar">
  <div class="StatusBar__section">
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <span {...props} class="StatusBar__item">
              {has_note ? word_count : "--"} words
            </span>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top" sideOffset={4}>
          Ln {line ?? "--"}, Col {column ?? "--"} · {has_note
            ? line_count
            : "--"} lines
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
    <span class="StatusBar__separator" aria-hidden="true"></span>
    <button
      type="button"
      class="StatusBar__mode-toggle"
      onclick={on_mode_toggle}
      aria-label="Toggle editor mode"
    >
      {editor_mode === "visual"
        ? "Visual"
        : editor_mode === "source"
          ? "Source"
          : "Read-only"}
    </button>
    <span class="StatusBar__separator" aria-hidden="true"></span>
    <button
      type="button"
      class="StatusBar__mode-toggle"
      class:StatusBar__mode-toggle--active={split_view}
      onclick={on_split_toggle}
      aria-label="Toggle split view"
      disabled={editor_mode === "read_only"}
    >
      Split
    </button>
    <span class="StatusBar__separator" aria-hidden="true"></span>
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class="StatusBar__mode-toggle"
              class:StatusBar__mode-toggle--active={width_mode === "wide"}
              onclick={on_width_toggle}
              aria-label="Toggle note width"
              disabled={!has_note}
            >
              {#if width_mode === "wide"}
                <ChevronsRightLeft />
              {:else}
                <ChevronsLeftRight />
              {/if}
            </button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top" sideOffset={4}>
          {width_mode === "wide"
            ? "Note width: wide — switch to normal"
            : "Note width: normal — switch to wide"}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
    <span class="StatusBar__separator" aria-hidden="true"></span>
    <button
      type="button"
      class="StatusBar__mode-toggle"
      class:StatusBar__mode-toggle--dimmed={!show_line_numbers}
      onclick={on_line_numbers_toggle}
      aria-label="Toggle line numbers"
    >
      Ln#
    </button>
    {#if zoom_percent !== 100}
      <span class="StatusBar__separator" aria-hidden="true"></span>
      <button
        type="button"
        class="StatusBar__mode-toggle"
        onclick={on_zoom_reset}
        aria-label="Reset zoom to 100%"
      >
        {zoom_percent}%
      </button>
    {/if}
    {#if saved_label}
      <span class="StatusBar__separator" aria-hidden="true"></span>
      <span class="StatusBar__item StatusBar__item--saved">{saved_label}</span>
    {/if}
    <span class="StatusBar__separator" aria-hidden="true"></span>
    <LintStatusIndicator
      error_count={lint_error_count}
      warning_count={lint_warning_count}
      is_running={lint_is_running}
      on_click={on_lint_click}
      on_format_click={on_lint_format_click}
    />
    {#if vim_nav_enabled}
      <span class="StatusBar__separator" aria-hidden="true"></span>
      <VimNavStatusIndicator
        active_context={vim_nav_context}
        pending_keys={vim_nav_pending_keys}
        on_click={on_vim_nav_cheatsheet}
      />
    {/if}
    <!-- STT removed — archived on archive/stt-main -->
    <!-- {#if stt_enabled}
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {/if}
    <SttStatusIndicator
      enabled={stt_enabled}
      recording_state={stt_recording_state}
      model_loading={stt_model_loading}
      has_model={stt_has_model}
      on_click={on_stt_click}
      on_settings_click={on_stt_settings_click}
    /> -->
  </div>
  <div class="StatusBar__section">
    {#if is_repairing_links}
      <span class="StatusBar__item StatusBar__item--repairing">
        <RefreshCw class="StatusBar__spinner" />
        <span>{link_repair_message ?? "Repairing links..."}</span>
      </span>
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {/if}

    {#if is_indexing}
      <span class="StatusBar__item StatusBar__item--indexing">
        <RefreshCw class="StatusBar__spinner" />
        {#if show_index_counts}
          <span>Indexing {index_progress.indexed}/{index_progress.total}</span>
        {:else}
          <span>Indexing...</span>
        {/if}
      </span>
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {:else if is_reindex_pending}
      <span class="StatusBar__item StatusBar__item--indexing">
        <RefreshCw class="StatusBar__spinner" />
        <span>Indexing...</span>
      </span>
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {:else if index_progress.status === "failed"}
      <button
        type="button"
        class="StatusBar__item StatusBar__item--failed StatusBar__item--clickable"
        onclick={on_sync_click}
        aria-label="Index failed — click to retry"
      >
        <span>Index failed — retry</span>
      </button>
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {:else if show_completed}
      <span class="StatusBar__item StatusBar__item--completed">
        <span>Indexed</span>
      </span>
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {/if}
    {#if embedding_progress.status === "embedding"}
      <span class="StatusBar__item StatusBar__item--indexing">
        <RefreshCw class="StatusBar__spinner" />
        {#if embedding_progress.total > 0}
          <span>
            Embedding {embedding_progress.embedded}/{embedding_progress.total}
          </span>
        {:else}
          <span>Embedding...</span>
        {/if}
      </span>
      <span class="StatusBar__separator" aria-hidden="true"></span>
    {/if}
    <div class="StatusBar__panel-tabs">
      <Tooltip.Provider delayDuration={0}>
        {#each PANEL_TABS as panel_tab (panel_tab.id)}
          {@const active =
            bottom_panel_open && bottom_panel_tab === panel_tab.id}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  class="StatusBar__action"
                  class:StatusBar__action--active={active}
                  aria-pressed={active}
                  aria-label="{panel_tab.label} panel"
                  onclick={() => on_panel_tab_click(panel_tab.id)}
                >
                  <panel_tab.icon />
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="top" sideOffset={4}>
              {panel_tab.label}
            </Tooltip.Content>
          </Tooltip.Root>
        {/each}
      </Tooltip.Provider>
    </div>
    <span class="StatusBar__separator" aria-hidden="true"></span>
    <button
      type="button"
      class="StatusBar__vault-action"
      onclick={on_vault_click}
      disabled={!vault_name}
      aria-label="Switch vault"
    >
      <FolderOpen />
      <span>{vault_name ?? "--"}</span>
    </button>
    <button
      type="button"
      class="StatusBar__action"
      onclick={on_info_click}
      disabled={!has_note}
      aria-label="Note details"
    >
      <Info />
    </button>

    {#if html_trust_level}
      <span class="StatusBar__separator" aria-hidden="true"></span>
      <Tooltip.Provider delayDuration={0}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class="StatusBar__item StatusBar__item--clickable StatusBar__trust StatusBar__trust--{html_trust_level ===
                'live+net'
                  ? 'live-net'
                  : html_trust_level}"
                onclick={on_html_trust_click}
                aria-label="HTML trust: {html_trust_level}"
              >
                {#if html_trust_level === "safe"}
                  <Shield class="StatusBar__trust-icon" />
                  <span>Safe</span>
                {:else if html_trust_level === "live"}
                  <ShieldCheck class="StatusBar__trust-icon" />
                  <span>Live</span>
                {:else}
                  <ShieldAlert class="StatusBar__trust-icon" />
                  <span>Live + Net</span>
                {/if}
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="top" sideOffset={4}>
            HTML trust level — click to manage
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    {/if}

    {#each status_bar_items as item (item.id)}
      <span class="StatusBar__separator" aria-hidden="true"></span>
      <item.component {...item.props} />
    {/each}

    {#if git_enabled}
      <span class="StatusBar__separator" aria-hidden="true"></span>
      <GitStatusWidget
        enabled={git_enabled}
        branch={git_branch}
        is_dirty={git_is_dirty}
        pending_files={git_pending_files}
        sync_status={git_sync_status}
        has_remote={git_has_remote}
        is_fetching={git_is_fetching}
        ahead={git_ahead}
        behind={git_behind}
        on_click={on_git_click}
        on_fetch={on_git_fetch}
        on_push={on_git_push}
        on_pull={on_git_pull}
        on_sync={on_git_sync}
        on_add_remote={on_git_add_remote}
      />
    {/if}
  </div>
</div>

<style>
  .StatusBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--size-status-bar);
    padding-inline: var(--space-3);
    font-size: var(--text-xs);
    font-feature-settings: "tnum" 1;
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background-color: var(--statusbar-bg);
    color: var(--statusbar-fg);
  }

  .StatusBar__section {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .StatusBar__item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .StatusBar__item--indexing {
    opacity: 1;
  }

  .StatusBar__item--repairing {
    opacity: 1;
  }

  .StatusBar__item--failed {
    color: var(--destructive);
  }

  .StatusBar__item--completed {
    opacity: 0.7;
  }

  .StatusBar__item--saved {
    opacity: 0.7;
  }

  .StatusBar__item--clickable {
    cursor: pointer;
    transition: color var(--duration-fast) var(--ease-default);
  }

  .StatusBar__item--clickable:hover {
    opacity: 1;
  }

  .StatusBar__trust {
    background: none;
    border: none;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    opacity: 0.85;
  }

  .StatusBar__trust:hover:not(:disabled) {
    opacity: 1;
  }

  .StatusBar__trust--safe {
    color: var(--muted-foreground);
  }

  .StatusBar__trust--live {
    color: var(--primary);
  }

  .StatusBar__trust--live-net {
    color: var(--warning, var(--chart-4));
  }

  :global(.StatusBar__trust-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .StatusBar__separator {
    width: 1px;
    height: var(--space-2-5);
    background-color: currentColor;
    opacity: 0.2;
  }

  .StatusBar__vault-action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 14rem;
    border-radius: var(--radius-sm);
    opacity: 0.7;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .StatusBar__vault-action > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .StatusBar__vault-action:hover:not(:disabled) {
    opacity: 1;
  }

  .StatusBar__vault-action:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .StatusBar__vault-action:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .StatusBar__action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border-radius: var(--radius-sm);
    opacity: 0.7;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .StatusBar__action:hover:not(:disabled) {
    opacity: 1;
  }

  .StatusBar__action:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .StatusBar__action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .StatusBar__action--active {
    opacity: 1;
  }

  .StatusBar__panel-tabs {
    display: flex;
    align-items: center;
  }

  .StatusBar__panel-tabs .StatusBar__action--active {
    color: var(--primary);
  }

  .StatusBar__mode-toggle {
    display: inline-flex;
    align-items: center;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    opacity: 0.7;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .StatusBar__mode-toggle:hover {
    opacity: 1;
  }

  .StatusBar__mode-toggle--dimmed {
    opacity: 0.4;
    text-decoration: line-through;
  }

  .StatusBar__mode-toggle--active {
    opacity: 1;
  }

  :global(.StatusBar__item svg),
  :global(.StatusBar__action svg),
  :global(.StatusBar__mode-toggle svg),
  :global(.StatusBar__vault-action svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  :global(.StatusBar__spinner) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* ----- StatusBar shape contract ----- */
  :global([data-statusbar-shape="transparent"]) .StatusBar {
    background: transparent;
    color: var(--foreground-secondary);
    border-top: 1px solid var(--border-subtle);
  }

  :global([data-statusbar-shape="segments"]) .StatusBar {
    gap: 0;
    padding: 0;
  }

  :global([data-statusbar-shape="segments"]) .StatusBar__section {
    gap: 0;
  }

  :global([data-statusbar-shape="segments"]) .StatusBar__separator {
    display: none;
  }

  :global([data-statusbar-shape="segments"]) .StatusBar__item,
  :global([data-statusbar-shape="segments"]) .StatusBar__vault-action,
  :global([data-statusbar-shape="segments"]) .StatusBar__action,
  :global([data-statusbar-shape="segments"]) .StatusBar__mode-toggle {
    padding-inline: var(--statusbar-segment-pad);
    height: 100%;
    border-left: 1px solid var(--statusbar-divider);
    display: inline-flex;
    align-items: center;
  }
</style>
