<script lang="ts">
  import { Sparkles, Play, CircleAlert } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { LspCodeAction, LspDiagnostic } from "$lib/features/lsp";
  import type {
    MarkdownLspStatus,
    MarkdownLspCapabilities,
    MarkdownLspProvider,
  } from "$lib/features/markdown_lsp";

  const { stores, action_registry } = use_app_context();

  const code_actions = $derived(stores.lsp.code_actions);
  const diagnostics = $derived(stores.lsp.diagnostics);

  const lsp_status = $derived(stores.markdown_lsp.status);
  const lsp_enabled = $derived(stores.ui.editor_settings.markdown_lsp_enabled);
  const effective_provider = $derived(stores.markdown_lsp.effective_provider);
  const capabilities = $derived(stores.markdown_lsp.capabilities);

  type LspTab = "code_actions" | "diagnostics";
  let active_tab = $state<LspTab>("code_actions");

  const tab_counts = $derived({
    code_actions: code_actions.length,
    diagnostics: diagnostics.length,
  });

  const PROVIDER_DISPLAY: Record<MarkdownLspProvider, string> = {
    iwes: "IWE",
    markdown_oxide: "Markdown Oxide",
    marksman: "Marksman",
  };

  const CAPABILITY_DISPLAY: Partial<
    Record<keyof MarkdownLspCapabilities, string>
  > = {
    hover: "Hover",
    completion: "Completion",
    definition: "Go to Definition",
    references: "References",
    code_actions: "Code Actions",
    rename: "Rename",
    formatting: "Formatting",
    inlay_hints: "Inlay Hints",
    transform_actions: "Transforms",
  };

  function status_label(s: MarkdownLspStatus): string {
    if (s === "running") return "Running";
    if (s === "starting") return "Starting\u2026";
    if (s === "stopped") return "Stopped";
    if (typeof s === "object" && "restarting" in s)
      return `Restarting (attempt ${s.restarting.attempt})\u2026`;
    if (typeof s === "object" && "failed" in s) return "Failed";
    return "Unknown";
  }

  function status_color(s: MarkdownLspStatus): string {
    if (s === "running") return "var(--success, #22c55e)";
    if (s === "starting") return "var(--warning, var(--chart-4))";
    if (s === "stopped") return "var(--muted-foreground)";
    if (typeof s === "object" && "restarting" in s)
      return "var(--warning, var(--chart-4))";
    if (typeof s === "object" && "failed" in s) return "var(--destructive)";
    return "var(--muted-foreground)";
  }

  function status_tooltip(s: MarkdownLspStatus): string | undefined {
    if (typeof s === "object" && "failed" in s) return s.failed.message;
    return undefined;
  }

  const active_capabilities = $derived.by(() => {
    if (!capabilities) return [];
    return (
      Object.entries(CAPABILITY_DISPLAY) as [
        keyof MarkdownLspCapabilities,
        string,
      ][]
    ).filter(([key]) => capabilities[key]);
  });

  function open_toolchain_settings() {
    void action_registry.execute(ACTION_IDS.settings_open, "toolchain");
  }

  function resolve_code_action(action: LspCodeAction) {
    void action_registry.execute(ACTION_IDS.lsp_code_action_resolve, action);
  }

  function refresh_diagnostics() {
    void action_registry.execute(ACTION_IDS.lsp_refresh_diagnostics);
  }

  function severity_class(severity: string): string {
    switch (severity) {
      case "error":
        return "LspResults__severity--error";
      case "warning":
        return "LspResults__severity--warning";
      case "info":
        return "LspResults__severity--info";
      default:
        return "LspResults__severity--hint";
    }
  }

  $effect(() => {
    if (active_tab === "diagnostics") {
      refresh_diagnostics();
    }
  });
</script>

<div class="LspResults">
  <div class="LspResults__header">
    <div class="LspResults__tabs">
      <button
        type="button"
        class="LspResults__tab"
        class:LspResults__tab--active={active_tab === "code_actions"}
        onclick={() => (active_tab = "code_actions")}
      >
        <Sparkles class="LspResults__tab-icon" />
        Code Actions
        {#if tab_counts.code_actions > 0}
          <span class="LspResults__badge">{tab_counts.code_actions}</span>
        {/if}
      </button>
      <button
        type="button"
        class="LspResults__tab"
        class:LspResults__tab--active={active_tab === "diagnostics"}
        onclick={() => (active_tab = "diagnostics")}
      >
        <CircleAlert class="LspResults__tab-icon" />
        Diagnostics
        {#if tab_counts.diagnostics > 0}
          <span class="LspResults__badge">{tab_counts.diagnostics}</span>
        {/if}
      </button>
    </div>
  </div>

  <div class="LspResults__status-strip">
    {#if !lsp_enabled}
      <span class="LspResults__status-text LspResults__status-text--muted">
        LSP Disabled
      </span>
      <button
        type="button"
        class="LspResults__enable-link"
        onclick={open_toolchain_settings}
      >
        Enable in Settings
      </button>
    {:else}
      <span
        class="LspResults__status-dot"
        style:background-color={status_color(lsp_status)}
      ></span>
      <span class="LspResults__status-text" title={status_tooltip(lsp_status)}>
        {#if effective_provider}
          {PROVIDER_DISPLAY[effective_provider]}
        {:else}
          LSP
        {/if}
        &middot; {status_label(lsp_status)}
      </span>
      {#if active_capabilities.length > 0}
        <span class="LspResults__cap-divider"></span>
        {#each active_capabilities as [, label]}
          <span class="LspResults__cap-badge">{label}</span>
        {/each}
      {/if}
    {/if}
  </div>

  <div class="LspResults__body">
    {#if active_tab === "code_actions"}
      {#if code_actions.length === 0}
        <div class="LspResults__empty">
          No code actions available. Press <kbd>Cmd+.</kbd> in the editor or use "Code
          Actions" from the command palette.
        </div>
      {:else}
        {#each code_actions as action, i (`action-${action.source}-${action.title}-${i}`)}
          <div class="LspResults__row">
            <Sparkles class="LspResults__row-icon" />
            <span class="LspResults__row-label">{action.title}</span>
            {#if action.kind}
              <span class="LspResults__row-kind">{action.kind}</span>
            {/if}
            <span class="LspResults__row-source">{action.source}</span>
            <button
              type="button"
              class="LspResults__apply-btn"
              onclick={() => resolve_code_action(action)}
              title="Apply this action"
              aria-label="Apply {action.title}"
            >
              <Play />
            </button>
          </div>
        {/each}
      {/if}
    {:else if active_tab === "diagnostics"}
      {#if diagnostics.length === 0}
        <div class="LspResults__empty">
          No LSP diagnostics for the current file.
        </div>
      {:else}
        {#each diagnostics as diag, i (`diag-${diag.source}-${diag.line}-${diag.message}-${i}`)}
          <div class="LspResults__row">
            <CircleAlert
              class="LspResults__row-icon {severity_class(diag.severity)}"
            />
            <span class="LspResults__row-label">{diag.message}</span>
            {#if diag.rule_id}
              <span class="LspResults__row-kind">{diag.rule_id}</span>
            {/if}
            <span class="LspResults__row-source">{diag.source}</span>
            <span class="LspResults__row-location">
              Ln {diag.line + 1}, Col {diag.column + 1}
            </span>
          </div>
        {/each}
      {/if}
    {/if}
  </div>
</div>

<style>
  .LspResults {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    color: var(--foreground);
    font-size: var(--text-sm);
  }

  .LspResults__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .LspResults__tabs {
    display: flex;
    align-items: center;
    gap: var(--space-0-5);
  }

  .LspResults__tab {
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

  .LspResults__tab:hover {
    opacity: 1;
    color: var(--foreground);
  }

  .LspResults__tab--active {
    opacity: 1;
    color: var(--foreground);
    border-bottom-color: var(--primary);
  }

  :global(.LspResults__tab-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .LspResults__badge {
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

  .LspResults__status-strip {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    padding: var(--space-0-5) var(--space-3);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    overflow-x: auto;
    scrollbar-width: none;
    flex-wrap: wrap;
  }

  .LspResults__status-strip::-webkit-scrollbar {
    display: none;
  }

  .LspResults__status-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full, 9999px);
    flex-shrink: 0;
  }

  .LspResults__status-text {
    white-space: nowrap;
    flex-shrink: 0;
  }

  .LspResults__status-text--muted {
    opacity: 0.6;
  }

  .LspResults__enable-link {
    font-size: var(--text-xs);
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
    white-space: nowrap;
  }

  .LspResults__enable-link:hover {
    opacity: 0.8;
  }

  .LspResults__cap-divider {
    width: 1px;
    height: 12px;
    background-color: var(--border);
    flex-shrink: 0;
  }

  .LspResults__cap-badge {
    display: inline-flex;
    align-items: center;
    padding: 0 var(--space-1);
    font-size: 10px;
    color: var(--muted-foreground);
    background-color: var(--muted);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    line-height: 1.6;
  }

  .LspResults__body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .LspResults__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted-foreground);
    padding: var(--space-4);
    text-align: center;
  }

  .LspResults__empty kbd {
    display: inline-block;
    padding: 0 var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background-color: var(--muted);
    font-size: var(--text-xs);
    font-family: inherit;
  }

  .LspResults__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    cursor: default;
    font-size: var(--text-xs);
  }

  .LspResults__row:hover {
    background-color: var(--muted);
  }

  :global(.LspResults__row-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  :global(.LspResults__severity--error) {
    color: var(--destructive) !important;
  }

  :global(.LspResults__severity--warning) {
    color: var(--warning, var(--chart-4)) !important;
  }

  :global(.LspResults__severity--info) {
    color: var(--primary) !important;
  }

  :global(.LspResults__severity--hint) {
    color: var(--muted-foreground) !important;
  }

  .LspResults__row-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .LspResults__row-kind {
    flex-shrink: 0;
    padding: 0 var(--space-1);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    background-color: var(--muted);
    border-radius: var(--radius-sm);
  }

  .LspResults__row-source {
    flex-shrink: 0;
    padding: 0 var(--space-1);
    font-size: var(--text-xs);
    color: var(--primary);
    background-color: color-mix(in oklch, var(--primary) 10%, transparent);
    border-radius: var(--radius-sm);
  }

  .LspResults__row-location {
    flex-shrink: 0;
    color: var(--muted-foreground);
    font-feature-settings: "tnum" 1;
    opacity: 0.6;
  }

  .LspResults__apply-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .LspResults__row:hover .LspResults__apply-btn {
    opacity: 1;
  }

  .LspResults__apply-btn:hover {
    color: var(--foreground);
    background-color: var(--accent);
  }

  :global(.LspResults__apply-btn > svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }
</style>
