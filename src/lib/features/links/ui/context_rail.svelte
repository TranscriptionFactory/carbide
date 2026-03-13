<script lang="ts">
  import { ACTION_IDS } from "$lib/app";
  import { AiAssistantPanel } from "$lib/features/ai";
  import { GraphPanel } from "$lib/features/graph";
  import LinksPanel from "$lib/features/links/ui/links_panel.svelte";
  import { OutlinePanel } from "$lib/features/outline";
  import { TaskPanel } from "$lib/features/task";
  import { use_app_context } from "$lib/app/context/app_context.svelte";

  const { stores, action_registry } = use_app_context();

  const tabs = [
    { id: "links" as const, label: "Links" },
    { id: "graph" as const, label: "Graph" },
    { id: "outline" as const, label: "Outline" },
    { id: "tasks" as const, label: "Tasks" },
    { id: "ai" as const, label: "AI" },
  ];

  async function select_tab(tab_id: (typeof tabs)[number]["id"]) {
    if (tab_id === "graph") {
      if (stores.graph.panel_open) {
        stores.ui.set_context_rail_tab("graph");
        return;
      }

      await action_registry.execute(ACTION_IDS.graph_focus_active_note);
      return;
    }

    if (stores.graph.panel_open) {
      await action_registry.execute(ACTION_IDS.graph_close, {
        preserve_context_rail: true,
      });
    }

    if (tab_id !== "ai") {
      stores.ui.set_context_rail_tab(tab_id);
      return;
    }

    if (stores.ai.dialog.open) {
      stores.ui.set_context_rail_tab("ai");
      return;
    }

    void action_registry.execute(ACTION_IDS.ai_open_assistant);
  }
</script>

<div class="ContextRail">
  <div class="ContextRail__tabs">
    {#each tabs as tab (tab.id)}
      <button
        type="button"
        class="ContextRail__tab"
        class:ContextRail__tab--active={stores.ui.context_rail_tab === tab.id}
        onclick={() => select_tab(tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </div>
  <div
    class="ContextRail__panel"
    class:ContextRail__panel--flush={stores.ui.context_rail_tab === "ai"}
  >
    {#if stores.ui.context_rail_tab === "links"}
      <LinksPanel />
    {:else if stores.ui.context_rail_tab === "graph"}
      <GraphPanel />
    {:else if stores.ui.context_rail_tab === "outline"}
      <OutlinePanel />
    {:else if stores.ui.context_rail_tab === "tasks"}
      <TaskPanel />
    {:else if stores.ui.context_rail_tab === "ai"}
      <AiAssistantPanel />
    {/if}
  </div>
</div>

<style>
  .ContextRail {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    border-inline-start: 1px solid var(--border);
  }

  .ContextRail__tabs {
    display: flex;
    align-items: center;
    height: var(--size-touch-lg);
    border-block-end: 1px solid var(--border);
    padding-inline: 0;
    flex-shrink: 0;
  }

  .ContextRail__tab {
    display: flex;
    align-items: center;
    height: 100%;
    padding-inline: var(--space-3);
    border: none;
    background: none;
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    border-block-end: 2px solid transparent;
    transition:
      color var(--duration-fast) var(--ease-default),
      border-color var(--duration-fast) var(--ease-default);
  }

  .ContextRail__tab:hover {
    color: var(--foreground);
  }

  .ContextRail__tab--active {
    color: var(--interactive);
    border-block-end-color: var(--interactive);
  }

  .ContextRail__panel {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding-block-start: var(--space-2);
  }

  .ContextRail__panel--flush {
    padding-block-start: 0;
  }
</style>
