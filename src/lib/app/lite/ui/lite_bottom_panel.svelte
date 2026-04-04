<script lang="ts">
  import { Terminal, CircleAlert } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";

  const { stores, action_registry } = use_app_context();

  const active_tab = $derived(
    stores.ui.bottom_panel_tab === "terminal" ? "terminal" : "problems",
  );
  const error_count = $derived(stores.diagnostics.error_count);
  const warning_count = $derived(stores.diagnostics.warning_count);
  const has_issues = $derived(error_count + warning_count > 0);

  function set_tab(tab: "terminal" | "problems") {
    stores.ui.bottom_panel_tab = tab;
    if (tab === "terminal") {
      stores.terminal.open();
    }
  }

  function close() {
    if (active_tab === "terminal") {
      void action_registry.execute(ACTION_IDS.terminal_close);
      return;
    }
    stores.ui.bottom_panel_open = false;
  }

  const load_terminal = () =>
    import("$lib/features/terminal/ui/terminal_panel_content.svelte");
  const load_problems = () =>
    import("$lib/features/lint/ui/problems_panel_content.svelte");
</script>

<div class="BottomPanel">
  <div class="BottomPanel__tabs">
    <button
      type="button"
      class="BottomPanel__tab"
      class:BottomPanel__tab--active={active_tab === "terminal"}
      onclick={() => set_tab("terminal")}
    >
      <Terminal class="BottomPanel__tab-icon" />
      Terminal
    </button>
    <button
      type="button"
      class="BottomPanel__tab"
      class:BottomPanel__tab--active={active_tab === "problems"}
      class:BottomPanel__tab--issues={has_issues && active_tab !== "problems"}
      onclick={() => set_tab("problems")}
    >
      <CircleAlert class="BottomPanel__tab-icon" />
      Problems
      {#if has_issues}
        <span class="BottomPanel__badge">{error_count + warning_count}</span>
      {/if}
    </button>
    <div class="BottomPanel__spacer"></div>
    <button
      type="button"
      class="BottomPanel__close"
      onclick={close}
      aria-label="Close panel"
      title="Close panel"
    >
      &times;
    </button>
  </div>
  <div class="BottomPanel__content">
    {#if active_tab === "terminal"}
      {#await load_terminal() then mod}
        <mod.default />
      {:catch}
        <div class="BottomPanel__error">Failed to load terminal</div>
      {/await}
    {:else}
      {#await load_problems() then mod}
        <mod.default />
      {:catch}
        <div class="BottomPanel__error">Failed to load panel</div>
      {/await}
    {/if}
  </div>
</div>

<style>
  .BottomPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    color: var(--foreground);
  }

  .BottomPanel__tabs {
    display: flex;
    align-items: center;
    height: var(--size-touch-sm, 2rem);
    border-bottom: 1px solid var(--border);
    padding-inline: var(--space-1);
    gap: var(--space-0-5);
    flex-shrink: 0;
  }

  .BottomPanel__tab {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-0-5) var(--space-2);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    border-bottom: 2px solid transparent;
    opacity: 0.7;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .BottomPanel__tab:hover {
    opacity: 1;
    color: var(--foreground);
  }

  .BottomPanel__tab--active {
    opacity: 1;
    color: var(--foreground);
    border-bottom-color: var(--primary);
  }

  .BottomPanel__tab--issues {
    color: var(--warning, oklch(0.75 0.15 85));
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

  .BottomPanel__content {
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
