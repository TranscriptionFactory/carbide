<script lang="ts">
  import { tick } from "svelte";
  import {
    CircleAlert,
    TriangleAlert,
    Info,
    Lightbulb,
    X,
    Wrench,
    FileText,
    Paintbrush,
    Copy,
  } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type {
    DiagnosticSeverity,
    DiagnosticSource,
    Diagnostic,
  } from "$lib/features/diagnostics";
  import type { LogEntry } from "$lib/features/lint/state/log_store.svelte";
  import {
    filter_file_groups,
    filter_logs,
    severity_options,
    line_col_to_offset,
  } from "$lib/features/lint/ui/problems_panel_filter";
  import type {
    StreamFilter,
    SeverityFilter,
  } from "$lib/features/lint/ui/problems_panel_filter";

  const { stores, services, action_registry } = use_app_context();

  const files = $derived(stores.diagnostics.files_with_diagnostics);
  const active_path = $derived(stores.diagnostics.active_file_path);
  const error_count = $derived(stores.diagnostics.error_count);
  const warning_count = $derived(stores.diagnostics.warning_count);
  const active_sources = $derived(stores.diagnostics.active_sources);
  const log_entries = $derived(stores.log.entries);
  const log_count = $derived(stores.log.entry_count);

  let stream_filter = $state<StreamFilter>("diagnostics");
  let severity_filter = $state<SeverityFilter>("all");
  let source_filter = $state<DiagnosticSource | "all">("all");
  let search_query = $state("");
  let log_viewport: HTMLElement | undefined = $state();

  const severity_opts = $derived(severity_options(stream_filter));

  $effect(() => {
    if (!severity_opts.some((o) => o.value === severity_filter)) {
      severity_filter = "all";
    }
  });

  $effect(() => {
    if (source_filter !== "all" && !active_sources.includes(source_filter)) {
      source_filter = "all";
    }
  });

  const file_groups = $derived(
    filter_file_groups(files, severity_filter, source_filter, search_query),
  );

  const log_rows = $derived(
    filter_logs(log_entries, severity_filter, search_query),
  );

  function severity_icon(severity: DiagnosticSeverity) {
    switch (severity) {
      case "error":
        return CircleAlert;
      case "warning":
        return TriangleAlert;
      case "info":
        return Info;
      case "hint":
        return Lightbulb;
    }
  }

  // ponytail: cross-file jump is best-effort — if the editor session hasn't
  // mounted by the post-open tick, the note opens without the cursor jump;
  // add a pending-line mechanism (like pending_heading_fragment) if it bites
  async function navigate_to(path: string, diagnostic: Diagnostic) {
    if (path !== active_path) {
      await action_registry.execute(ACTION_IDS.note_open, path);
      await tick();
    }
    const markdown = services.editor.get_markdown();
    if (!markdown) return;
    const offset = line_col_to_offset(
      markdown,
      diagnostic.line,
      diagnostic.column,
    );
    if (offset === null) return;
    services.editor.set_cursor_from_markdown_offset(offset);
    services.editor.scroll_cursor_into_view();
  }

  function close() {
    void action_registry.execute(ACTION_IDS.lint_toggle_problems);
  }

  function fix_all() {
    void action_registry.execute(ACTION_IDS.lint_fix_all);
  }

  function format_file() {
    void action_registry.execute(ACTION_IDS.lint_format_file);
  }

  function copy_log() {
    const text = log_rows
      .map(
        (e) =>
          `[${e.level.toUpperCase()}] ${format_timestamp(e.timestamp)} ${e.message}`,
      )
      .join("\n");
    void navigator.clipboard.writeText(text);
  }

  function source_label(source: DiagnosticSource): string {
    if (source === "lint") return "Lint";
    if (source === "markdown_lsp") return "Markdown LSP";
    if (source === "code_lsp") return "Code LSP";
    if (source === "ast") return "AST";
    if (source.startsWith("plugin:")) return source.slice("plugin:".length);
    return source;
  }

  function format_timestamp(ts: number): string {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  $effect(() => {
    if (stream_filter === "logs" && log_viewport && log_rows.length > 0) {
      log_viewport.scrollTop = log_viewport.scrollHeight;
    }
  });

  function log_level_class(level: LogEntry["level"]): string {
    switch (level) {
      case "error":
        return "ProblemsPanel__log-level--error";
      case "warn":
        return "ProblemsPanel__log-level--warn";
      case "info":
        return "ProblemsPanel__log-level--info";
      case "debug":
        return "ProblemsPanel__log-level--debug";
      case "trace":
        return "ProblemsPanel__log-level--trace";
    }
  }
</script>

<div class="ProblemsPanel">
  <div class="ProblemsPanel__header">
    <div class="ProblemsPanel__title">
      <span class="ProblemsPanel__heading">Problems</span>
      {#if stream_filter === "diagnostics"}
        <span class="ProblemsPanel__counts">
          {#if error_count > 0}
            <span class="ProblemsPanel__count ProblemsPanel__count--error">
              <CircleAlert class="ProblemsPanel__count-icon" />
              {error_count}
            </span>
          {/if}
          {#if warning_count > 0}
            <span class="ProblemsPanel__count ProblemsPanel__count--warning">
              <TriangleAlert class="ProblemsPanel__count-icon" />
              {warning_count}
            </span>
          {/if}
        </span>
      {:else}
        <span class="ProblemsPanel__counts">
          <span class="ProblemsPanel__count ProblemsPanel__count--log">
            {log_count} entries
          </span>
        </span>
      {/if}
    </div>
    <div class="ProblemsPanel__actions">
      <div class="ProblemsPanel__search">
        <input
          type="text"
          class="ProblemsPanel__search-input"
          placeholder="Filter by rule or message…"
          bind:value={search_query}
        />
      </div>
      <select
        class="ProblemsPanel__filter"
        bind:value={stream_filter}
        aria-label="Filter by stream"
      >
        <option value="diagnostics">Diagnostics</option>
        <option value="logs">Logs</option>
      </select>
      <select
        class="ProblemsPanel__filter"
        bind:value={severity_filter}
        aria-label="Filter by severity"
      >
        {#each severity_opts as opt (opt.value)}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
      {#if stream_filter === "diagnostics"}
        <select
          class="ProblemsPanel__filter"
          bind:value={source_filter}
          aria-label="Filter by source"
        >
          <option value="all">All Sources</option>
          {#each active_sources as source (source)}
            <option value={source}>{source_label(source)}</option>
          {/each}
        </select>
        <button
          type="button"
          class="ProblemsPanel__action-btn"
          onclick={format_file}
          title="Format current file"
          aria-label="Format current file"
        >
          <Paintbrush />
        </button>
        <button
          type="button"
          class="ProblemsPanel__action-btn"
          onclick={fix_all}
          title="Fix all in current file"
          aria-label="Fix all in current file"
        >
          <Wrench />
        </button>
      {:else}
        <button
          type="button"
          class="ProblemsPanel__action-btn"
          onclick={copy_log}
          title="Copy log"
          aria-label="Copy log to clipboard"
        >
          <Copy />
        </button>
        <button
          type="button"
          class="ProblemsPanel__action-btn"
          onclick={() => stores.log.clear()}
          title="Clear log"
          aria-label="Clear log"
        >
          <X />
        </button>
      {/if}
      <button
        type="button"
        class="ProblemsPanel__action-btn"
        onclick={close}
        title="Close problems panel"
        aria-label="Close problems panel"
      >
        <X />
      </button>
    </div>
  </div>

  <div
    class="ProblemsPanel__body"
    class:ProblemsPanel__log-body={stream_filter === "logs"}
    bind:this={log_viewport}
  >
    {#if stream_filter === "logs"}
      {#if log_rows.length === 0}
        <div class="ProblemsPanel__empty">
          {#if log_count === 0}
            No log entries yet.
          {:else}
            No entries match the current filter.
          {/if}
        </div>
      {:else}
        {#each log_rows as entry, i (i)}
          <div class="ProblemsPanel__log-row">
            <span
              class="ProblemsPanel__log-level {log_level_class(entry.level)}"
              >{entry.level}</span
            >
            <span class="ProblemsPanel__log-time"
              >{format_timestamp(entry.timestamp)}</span
            >
            <span class="ProblemsPanel__log-message">{entry.message}</span>
          </div>
        {/each}
      {/if}
    {:else if file_groups.length === 0}
      <div class="ProblemsPanel__empty">
        {#if files.length === 0}
          No problems detected.
        {:else}
          No entries match the current filter.
        {/if}
      </div>
    {:else}
      {#each file_groups as file (file.path)}
        <div class="ProblemsPanel__group">
          <div class="ProblemsPanel__file-header">
            <FileText class="ProblemsPanel__file-icon" />
            <span class="ProblemsPanel__file-name">{file.path}</span>
            <span class="ProblemsPanel__file-count">
              {file.diagnostics.length}
            </span>
          </div>
          {#each file.diagnostics as diagnostic, i (`${diagnostic.source}-${diagnostic.line}-${diagnostic.column}-${i}`)}
            {@const Icon = severity_icon(diagnostic.severity)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="ProblemsPanel__row"
              onclick={() => void navigate_to(file.path, diagnostic)}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ")
                  void navigate_to(file.path, diagnostic);
              }}
              role="button"
              tabindex="0"
            >
              <Icon
                class="ProblemsPanel__severity-icon ProblemsPanel__severity-icon--{diagnostic.severity}"
              />
              <span class="ProblemsPanel__message">{diagnostic.message}</span>
              {#if diagnostic.rule_id}
                <span class="ProblemsPanel__rule">{diagnostic.rule_id}</span>
              {/if}
              <span class="ProblemsPanel__location">
                Ln {diagnostic.line}, Col {diagnostic.column}
              </span>
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .ProblemsPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    color: var(--foreground);
    font-size: var(--text-sm);
  }

  .ProblemsPanel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .ProblemsPanel__title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .ProblemsPanel__heading {
    font-weight: 600;
    font-size: var(--text-sm);
    flex-shrink: 0;
  }

  .ProblemsPanel__counts {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .ProblemsPanel__count {
    display: flex;
    align-items: center;
    gap: var(--space-0-5);
    font-size: var(--text-xs);
    font-feature-settings: "tnum" 1;
  }

  .ProblemsPanel__count--error {
    color: var(--destructive);
  }

  .ProblemsPanel__count--warning {
    color: var(--warning, oklch(0.75 0.15 85));
  }

  .ProblemsPanel__count--log {
    color: var(--muted-foreground);
  }

  :global(.ProblemsPanel__count-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .ProblemsPanel__actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .ProblemsPanel__search {
    display: flex;
    align-items: center;
  }

  .ProblemsPanel__search-input {
    width: 12rem;
    height: var(--size-touch-xs);
    padding: 0 var(--space-2);
    font-size: var(--text-xs);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--muted);
    color: var(--foreground);
  }

  .ProblemsPanel__search-input::placeholder {
    color: var(--muted-foreground);
    opacity: 0.6;
  }

  .ProblemsPanel__search-input:focus {
    outline: 2px solid var(--focus-ring);
    outline-offset: -1px;
  }

  .ProblemsPanel__filter {
    height: var(--size-touch-xs);
    padding: 0 var(--space-2);
    font-size: var(--text-xs);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--muted);
    color: var(--foreground);
    cursor: pointer;
  }

  .ProblemsPanel__filter:focus {
    outline: 2px solid var(--focus-ring);
    outline-offset: -1px;
  }

  .ProblemsPanel__action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    opacity: 0.7;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .ProblemsPanel__action-btn:hover {
    opacity: 1;
    color: var(--interactive);
  }

  .ProblemsPanel__action-btn:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  :global(.ProblemsPanel__action-btn svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .ProblemsPanel__body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .ProblemsPanel__log-body {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
  }

  .ProblemsPanel__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }

  .ProblemsPanel__group {
    display: flex;
    flex-direction: column;
  }

  .ProblemsPanel__file-header {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--muted-foreground);
    background-color: var(--muted);
    position: sticky;
    top: 0;
  }

  :global(.ProblemsPanel__file-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    flex-shrink: 0;
  }

  .ProblemsPanel__file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ProblemsPanel__file-count {
    flex-shrink: 0;
    font-weight: 400;
    font-feature-settings: "tnum" 1;
    opacity: 0.7;
  }

  .ProblemsPanel__row {
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

  .ProblemsPanel__row:hover {
    background-color: var(--muted);
  }

  .ProblemsPanel__row:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  :global(.ProblemsPanel__severity-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    flex-shrink: 0;
  }

  :global(.ProblemsPanel__severity-icon--error) {
    color: var(--destructive);
  }

  :global(.ProblemsPanel__severity-icon--warning) {
    color: var(--warning, oklch(0.75 0.15 85));
  }

  :global(.ProblemsPanel__severity-icon--info) {
    color: var(--primary);
  }

  :global(.ProblemsPanel__severity-icon--hint) {
    color: var(--muted-foreground);
  }

  .ProblemsPanel__message {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ProblemsPanel__rule {
    flex-shrink: 0;
    color: var(--muted-foreground);
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    opacity: 0.7;
  }

  .ProblemsPanel__location {
    flex-shrink: 0;
    color: var(--muted-foreground);
    font-feature-settings: "tnum" 1;
    opacity: 0.6;
  }

  .ProblemsPanel__log-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-0-5) var(--space-3);
    border-bottom: 1px solid transparent;
  }

  .ProblemsPanel__log-row:hover {
    background-color: var(--muted);
  }

  .ProblemsPanel__log-level {
    flex-shrink: 0;
    width: 2.5rem;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .ProblemsPanel__log-level--error {
    color: var(--destructive);
  }

  .ProblemsPanel__log-level--warn {
    color: var(--warning, oklch(0.75 0.15 85));
  }

  .ProblemsPanel__log-level--info {
    color: var(--primary);
  }

  .ProblemsPanel__log-level--debug {
    color: var(--muted-foreground);
  }

  .ProblemsPanel__log-level--trace {
    color: var(--muted-foreground);
    opacity: 0.6;
  }

  .ProblemsPanel__log-time {
    flex-shrink: 0;
    color: var(--muted-foreground);
    font-size: var(--text-xs);
    font-feature-settings: "tnum" 1;
    opacity: 0.7;
  }

  .ProblemsPanel__log-message {
    flex: 1;
    min-width: 0;
    color: var(--foreground);
    font-size: var(--text-xs);
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
