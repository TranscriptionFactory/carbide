<script lang="ts">
  import {
    CircleAlert,
    TriangleAlert,
    Info,
    Lightbulb,
    X,
    Wrench,
    Filter,
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

  const { stores, action_registry } = use_app_context();

  const diagnostics = $derived(stores.diagnostics.active_diagnostics);
  const active_path = $derived(stores.diagnostics.active_file_path);
  const error_count = $derived(stores.diagnostics.error_count);
  const warning_count = $derived(stores.diagnostics.warning_count);
  const active_sources = $derived(stores.diagnostics.active_sources);
  const log_entries = $derived(stores.log.entries);
  const log_count = $derived(stores.log.entry_count);

  let severity_filter = $state<DiagnosticSeverity | "all" | "log">("all");
  let source_filter = $state<DiagnosticSource | "all">("all");
  let search_query = $state("");
  let log_viewport: HTMLElement | undefined = $state();

  const filtered = $derived.by(() => {
    let items = diagnostics;
    if (severity_filter !== "all" && severity_filter !== "log") {
      items = items.filter((d) => d.severity === severity_filter);
    }
    if (source_filter !== "all") {
      items = items.filter((d) => d.source === source_filter);
    }
    if (search_query) {
      const q = search_query.toLowerCase();
      items = items.filter(
        (d) =>
          d.message.toLowerCase().includes(q) ||
          (d.rule_id && d.rule_id.toLowerCase().includes(q)),
      );
    }
    return items;
  });

  const filtered_logs = $derived.by(() => {
    if (!search_query) return log_entries;
    const q = search_query.toLowerCase();
    return log_entries.filter((e) => e.message.toLowerCase().includes(q));
  });

  const grouped = $derived.by(() => {
    const groups: Record<DiagnosticSeverity, Diagnostic[]> = {
      error: [],
      warning: [],
      info: [],
      hint: [],
    };
    for (const d of filtered) {
      groups[d.severity].push(d);
    }
    return groups;
  });

  const severity_order: DiagnosticSeverity[] = [
    "error",
    "warning",
    "info",
    "hint",
  ];

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

  function navigate_to(diagnostic: Diagnostic) {
    void diagnostic;
  }

  function fix_diagnostic(diagnostic: Diagnostic) {
    if (!diagnostic.fixable) return;
    void action_registry.execute(ACTION_IDS.lint_fix_all);
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
    const text = filtered_logs
      .map(
        (e) =>
          `[${e.level.toUpperCase()}] ${format_timestamp(e.timestamp)} ${e.message}`,
      )
      .join("\n");
    void navigator.clipboard.writeText(text);
  }

  function source_label(source: DiagnosticSource): string {
    if (source === "lint") return "Lint";
    if (source === "iwe") return "IWE";
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
    if (severity_filter === "log" && log_viewport && filtered_logs.length > 0) {
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
      {#if severity_filter !== "log"}
        {#if active_path}
          <span class="ProblemsPanel__file-path">{active_path}</span>
        {/if}
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
        bind:value={severity_filter}
        aria-label="Filter by severity"
      >
        <option value="all">All</option>
        <option value="error">Errors</option>
        <option value="warning">Warnings</option>
        <option value="info">Info</option>
        <option value="hint">Hints</option>
        <option value="log">Log</option>
      </select>
      {#if severity_filter !== "log"}
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
      {/if}
      {#if severity_filter !== "log"}
        <button
          type="button"
          class="ProblemsPanel__action-btn"
          onclick={format_file}
          title="Format file"
          aria-label="Format file"
        >
          <Filter />
        </button>
        <button
          type="button"
          class="ProblemsPanel__action-btn"
          onclick={fix_all}
          title="Fix all"
          aria-label="Fix all"
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

  {#if severity_filter === "log"}
    <div
      class="ProblemsPanel__body ProblemsPanel__log-body"
      bind:this={log_viewport}
    >
      {#if filtered_logs.length === 0}
        <div class="ProblemsPanel__empty">
          {#if log_count === 0}
            No log entries yet.
          {:else}
            No log entries match the current filter.
          {/if}
        </div>
      {:else}
        {#each filtered_logs as entry, i (i)}
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
    </div>
  {:else}
    <div class="ProblemsPanel__body">
      {#if filtered.length === 0}
        <div class="ProblemsPanel__empty">
          {#if diagnostics.length === 0}
            No problems detected in this file.
          {:else}
            No problems match the current filter.
          {/if}
        </div>
      {:else}
        {#each severity_order as severity (severity)}
          {#if grouped[severity].length > 0}
            <div class="ProblemsPanel__group">
              {#each grouped[severity] as diagnostic, i (`${severity}-${diagnostic.line}-${diagnostic.column}-${i}`)}
                {@const Icon = severity_icon(diagnostic.severity)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="ProblemsPanel__row"
                  class:ProblemsPanel__row--fixable={diagnostic.fixable}
                  onclick={() => navigate_to(diagnostic)}
                  onkeydown={(e: KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ")
                      navigate_to(diagnostic);
                  }}
                  role="button"
                  tabindex="0"
                >
                  <Icon
                    class="ProblemsPanel__severity-icon ProblemsPanel__severity-icon--{diagnostic.severity}"
                  />
                  <span class="ProblemsPanel__message"
                    >{diagnostic.message}</span
                  >
                  {#if diagnostic.rule_id}
                    <span class="ProblemsPanel__rule">{diagnostic.rule_id}</span
                    >
                  {/if}
                  <span class="ProblemsPanel__location">
                    Ln {diagnostic.line}, Col {diagnostic.column}
                  </span>
                  {#if diagnostic.fixable}
                    <button
                      type="button"
                      class="ProblemsPanel__fix-btn"
                      onclick={(e: MouseEvent) => {
                        e.stopPropagation();
                        fix_diagnostic(diagnostic);
                      }}
                      title="Fix"
                      aria-label="Fix this issue"
                    >
                      <Wrench />
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
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

  .ProblemsPanel__file-path {
    color: var(--muted-foreground);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .ProblemsPanel__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-3);
    text-align: left;
    font-size: var(--text-xs);
    color: var(--foreground);
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

  .ProblemsPanel__fix-btn {
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

  .ProblemsPanel__row:hover .ProblemsPanel__fix-btn {
    opacity: 0.7;
  }

  .ProblemsPanel__fix-btn:hover {
    opacity: 1;
    color: var(--interactive);
  }

  :global(.ProblemsPanel__fix-btn svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
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
