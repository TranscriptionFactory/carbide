<script lang="ts">
  import {
    Terminal,
    CircleAlert,
    Search,
    Zap,
    Bot,
    ShieldCheck,
  } from "@lucide/svelte";
  import type { Component } from "svelte";
  import * as Tabs from "$lib/components/ui/tabs";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { BottomPanelTab } from "$lib/app/orchestration/ui_store.svelte";

  const { stores, action_registry } = use_app_context();

  const active_tab = $derived(stores.ui.bottom_panel_tab);
  const error_count = $derived(stores.diagnostics.error_count);
  const warning_count = $derived(stores.diagnostics.warning_count);
  const has_issues = $derived(error_count + warning_count > 0);

  function set_tab(tab: BottomPanelTab) {
    stores.ui.bottom_panel_tab = tab;
    if (tab === "terminal") {
      stores.terminal.open();
    }
  }

  function close() {
    if (active_tab === "terminal") {
      void action_registry.execute(ACTION_IDS.terminal_close);
    } else {
      stores.ui.bottom_panel_open = false;
    }
  }

  const lsp_result_count = $derived(stores.lsp.code_actions.length);

  const load_terminal = () =>
    import("$lib/features/terminal/ui/terminal_panel_content.svelte");
  const load_problems = () =>
    import("$lib/features/lint/ui/problems_panel_content.svelte");
  const load_query = () =>
    import("$lib/features/query/ui/query_panel_content.svelte");
  const load_lsp_results = () =>
    import("$lib/features/lsp/ui/lsp_results_panel_content.svelte");
  const load_ai = () => import("$lib/features/ai/ui/ai_assistant_panel.svelte");
  const load_trust = () =>
    import("$lib/features/document/ui/trust_panel_content.svelte");

  const query_result_count = $derived(stores.query.result?.total ?? 0);

  type TabDef = {
    id: BottomPanelTab;
    label: string;
    icon: Component;
    badge?: () => number;
  };

  const tab_defs: TabDef[] = [
    { id: "terminal", label: "Terminal", icon: Terminal },
    {
      id: "problems",
      label: "Problems",
      icon: CircleAlert,
      badge: () => error_count + warning_count,
    },
    {
      id: "lsp_results",
      label: "LSP",
      icon: Zap,
      badge: () => lsp_result_count,
    },
    {
      id: "query",
      label: "Query",
      icon: Search,
      badge: () => query_result_count,
    },
    { id: "ai", label: "AI", icon: Bot },
    { id: "trust", label: "Trust", icon: ShieldCheck },
  ];
</script>

<Tabs.Root
  value={active_tab}
  onValueChange={(v) => set_tab(v as BottomPanelTab)}
  class="BottomPanel"
  data-testid="bottom-panel"
>
  <div class="BottomPanel__bar">
    <Tabs.List class="BottomPanel__tabs">
      {#each tab_defs as t (t.id)}
        <Tabs.Trigger
          value={t.id}
          class="BottomPanel__tab"
          data-issues={t.id === "problems" && has_issues ? "" : undefined}
          data-testid={"bottom-panel-tab-" + t.id}
        >
          <t.icon class="BottomPanel__tab-icon" />
          {t.label}
          {#if t.badge && t.badge() > 0}
            <span class="BottomPanel__badge">{t.badge()}</span>
          {/if}
        </Tabs.Trigger>
      {/each}
    </Tabs.List>
    <div class="BottomPanel__spacer"></div>
    <button
      type="button"
      class="BottomPanel__close"
      onclick={close}
      aria-label="Close panel"
      title="Close panel"
      data-testid="bottom-panel-close"
    >
      &times;
    </button>
  </div>
  <Tabs.Content value="terminal" class="BottomPanel__content">
    {#await load_terminal() then mod}
      <mod.default />
    {:catch}
      <div class="BottomPanel__error">Failed to load terminal</div>
    {/await}
  </Tabs.Content>
  <Tabs.Content value="lsp_results" class="BottomPanel__content">
    {#await load_lsp_results() then mod}
      <mod.default />
    {:catch}
      <div class="BottomPanel__error">Failed to load panel</div>
    {/await}
  </Tabs.Content>
  <Tabs.Content value="query" class="BottomPanel__content">
    {#await load_query() then mod}
      <mod.default />
    {:catch}
      <div class="BottomPanel__error">Failed to load panel</div>
    {/await}
  </Tabs.Content>
  <Tabs.Content value="ai" class="BottomPanel__content">
    {#await load_ai() then mod}
      <mod.default />
    {:catch}
      <div class="BottomPanel__error">Failed to load AI panel</div>
    {/await}
  </Tabs.Content>
  <Tabs.Content value="trust" class="BottomPanel__content">
    {#await load_trust() then mod}
      <mod.default />
    {:catch}
      <div class="BottomPanel__error">Failed to load trust panel</div>
    {/await}
  </Tabs.Content>
  <Tabs.Content value="problems" class="BottomPanel__content">
    {#await load_problems() then mod}
      <mod.default />
    {:catch}
      <div class="BottomPanel__error">Failed to load panel</div>
    {/await}
  </Tabs.Content>
</Tabs.Root>

<style>
  :global(.BottomPanel) {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    color: var(--foreground);
  }

  .BottomPanel__bar {
    display: flex;
    align-items: center;
    height: var(--size-touch-sm, 2rem);
    box-shadow: inset 0 -1px 0 var(--border);
    padding-inline: var(--space-1);
    gap: var(--space-0-5);
    flex-shrink: 0;
  }

  :global(.BottomPanel__tabs) {
    display: flex;
    align-items: center;
    gap: var(--space-0-5);
  }

  :global(.BottomPanel__tab) {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: var(--size-touch-xs);
    padding-inline: var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--muted-foreground);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    transition:
      color var(--duration-normal) var(--ease-default),
      background-color var(--duration-normal) var(--ease-default),
      box-shadow var(--duration-normal) var(--ease-default);
  }

  :global(.BottomPanel__tab:hover) {
    color: var(--foreground);
    background-color: var(--accent);
  }

  :global(.BottomPanel__tab[data-state="active"]) {
    color: var(--foreground);
    background-color: var(--background);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  :global(.BottomPanel__tab[data-issues][data-state="inactive"]) {
    color: var(--warning);
  }

  :global(.BottomPanel__tab-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .BottomPanel__badge {
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

  .BottomPanel__spacer {
    flex: 1;
  }

  .BottomPanel__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    font-size: var(--text-base);
    opacity: 0.5;
    transition: opacity var(--duration-fast) var(--ease-default);
  }

  .BottomPanel__close:hover {
    opacity: 1;
    color: var(--foreground);
  }

  :global(.BottomPanel__content) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .BottomPanel__error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--destructive);
    font-size: var(--text-sm);
  }
</style>
