<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import { query_name_from_path } from "../domain/saved_query";
  import QueryResultList from "./query_result_list.svelte";
  import QueryResultCards from "./query_result_cards.svelte";
  import QueryResultFeed from "./query_result_feed.svelte";
  import LayoutList from "@lucide/svelte/icons/layout-list";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import Rows from "@lucide/svelte/icons/rows-3";

  const { stores, action_registry } = use_app_context();

  type ResultViewMode = "list" | "cards" | "feed";

  let input_value = $state(stores.query.query_text || "");
  let save_name = $state("");
  let show_save_input = $state(false);
  let view_mode: ResultViewMode = $state("list");
  const status = $derived(stores.query.status);
  const result = $derived(stores.query.result);
  const error = $derived(stores.query.error);
  const saved_queries = $derived(stores.query.saved_queries);
  const active_path = $derived(stores.query.active_saved_path);
  const save_op = $derived(stores.op.get("query.save"));
  const save_error = $derived(
    save_op.status === "error" ? save_op.error : null,
  );
  const save_pending = $derived(save_op.status === "pending");

  $effect(() => {
    const vault = stores.vault.vault;
    if (!vault) return;
    void action_registry.execute(ACTION_IDS.query_list_saved);
  });

  async function execute() {
    await action_registry.execute(ACTION_IDS.query_execute, input_value);
  }

  function handle_keydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void execute();
    }
  }

  function open_note(path: string) {
    void action_registry.execute(ACTION_IDS.note_open, path);
  }

  function start_save() {
    const active = active_path;
    save_name = active ? query_name_from_path(active) : "";
    void action_registry.execute(ACTION_IDS.query_save_cancel);
    show_save_input = true;
  }

  async function confirm_save() {
    await action_registry.execute(ACTION_IDS.query_save, save_name);
    if (stores.op.get("query.save").status !== "error") {
      show_save_input = false;
    }
  }

  function cancel_save() {
    show_save_input = false;
    void action_registry.execute(ACTION_IDS.query_save_cancel);
  }

  function handle_save_keydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      void confirm_save();
    } else if (event.key === "Escape") {
      cancel_save();
    }
  }

  function load_query(path: string) {
    void action_registry.execute(ACTION_IDS.query_load, path).then(() => {
      input_value = stores.query.query_text;
    });
  }

  function delete_query(event: MouseEvent, path: string) {
    event.stopPropagation();
    void action_registry.execute(ACTION_IDS.query_delete_saved, path);
  }

  const view_modes: {
    mode: ResultViewMode;
    icon: typeof LayoutList;
    title: string;
  }[] = [
    { mode: "list", icon: LayoutList, title: "List" },
    { mode: "cards", icon: LayoutGrid, title: "Cards" },
    { mode: "feed", icon: Rows, title: "Feed" },
  ];
</script>

<div class="QueryPanel">
  <div class="QueryPanel__input-row">
    <input
      class="QueryPanel__input"
      type="text"
      bind:value={input_value}
      onkeydown={handle_keydown}
      placeholder="e.g. Notes with #project and in [[Archive]]"
      spellcheck="false"
    />
    <button
      type="button"
      class="QueryPanel__run"
      onclick={execute}
      disabled={status === "running"}
    >
      {status === "running" ? "Running..." : "Run"}
    </button>
    <button
      type="button"
      class="QueryPanel__save-btn"
      onclick={start_save}
      disabled={!input_value.trim()}
      title="Save query"
    >
      Save
    </button>
  </div>

  {#if show_save_input}
    <div class="QueryPanel__save-row">
      <input
        class="QueryPanel__save-input"
        type="text"
        bind:value={save_name}
        onkeydown={handle_save_keydown}
        placeholder="Query name..."
        spellcheck="false"
      />
      <button
        type="button"
        class="QueryPanel__save-confirm"
        onclick={confirm_save}
        disabled={save_pending}
      >
        {save_pending ? "Saving..." : "OK"}
      </button>
      <button
        type="button"
        class="QueryPanel__save-cancel"
        onclick={cancel_save}
      >
        Cancel
      </button>
    </div>
    {#if save_error}
      <div class="QueryPanel__error">{save_error}</div>
    {/if}
  {/if}

  {#if error}
    <div class="QueryPanel__error">
      {error.message}
    </div>
  {/if}

  {#if saved_queries.length > 0}
    <div class="QueryPanel__saved">
      <div class="QueryPanel__saved-label">Saved queries</div>
      <div class="QueryPanel__saved-list">
        {#each saved_queries as sq (sq.path)}
          <span
            class="QueryPanel__saved-item"
            class:QueryPanel__saved-item--active={active_path === sq.path}
            role="button"
            tabindex="0"
            onclick={() => load_query(sq.path)}
            onkeydown={(e) => e.key === "Enter" && load_query(sq.path)}
            title={sq.path}
          >
            <span class="QueryPanel__saved-name">{sq.name}</span>
            <button
              type="button"
              class="QueryPanel__saved-delete"
              onclick={(e) => delete_query(e, sq.path)}
              title="Delete"
            >
              ×
            </button>
          </span>
        {/each}
      </div>
    </div>
  {/if}

  {#if result}
    <div class="QueryPanel__results-header">
      <span class="QueryPanel__meta">
        {result.total} result{result.total === 1 ? "" : "s"} in {result.elapsed_ms}ms
      </span>
      <div class="QueryPanel__view-toggle">
        {#each view_modes as vm (vm.mode)}
          <button
            type="button"
            class="QueryPanel__view-btn"
            class:QueryPanel__view-btn--active={view_mode === vm.mode}
            onclick={() => (view_mode = vm.mode)}
            title={vm.title}
          >
            <vm.icon size={14} />
          </button>
        {/each}
      </div>
    </div>
    <div class="QueryPanel__results">
      {#if view_mode === "list"}
        <QueryResultList items={result.items} onopen={open_note} />
      {:else if view_mode === "cards"}
        <QueryResultCards items={result.items} onopen={open_note} />
      {:else if view_mode === "feed"}
        <QueryResultFeed items={result.items} onopen={open_note} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .QueryPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-2);
    gap: var(--space-2);
    overflow: hidden;
  }

  .QueryPanel__input-row {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .QueryPanel__input {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    background-color: var(--input);
    color: var(--foreground);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: none;
  }

  .QueryPanel__input:focus {
    border-color: var(--ring);
  }

  .QueryPanel__run {
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
    background-color: var(--primary);
    color: var(--primary-foreground);
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }

  .QueryPanel__run:disabled {
    opacity: 0.5;
  }

  .QueryPanel__save-btn {
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    background-color: var(--secondary);
    color: var(--secondary-foreground);
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }

  .QueryPanel__save-btn:disabled {
    opacity: 0.4;
  }

  .QueryPanel__save-row {
    display: flex;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .QueryPanel__save-input {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    background-color: var(--input);
    color: var(--foreground);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: none;
  }

  .QueryPanel__save-input:focus {
    border-color: var(--ring);
  }

  .QueryPanel__save-confirm,
  .QueryPanel__save-cancel {
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }

  .QueryPanel__save-confirm {
    background-color: var(--primary);
    color: var(--primary-foreground);
  }

  .QueryPanel__save-cancel {
    background-color: var(--muted);
    color: var(--muted-foreground);
  }

  .QueryPanel__error {
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    color: var(--destructive);
    background-color: var(--destructive-foreground, oklch(0.95 0.01 25));
    border-radius: var(--radius-sm);
  }

  .QueryPanel__saved {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .QueryPanel__saved-label {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .QueryPanel__saved-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .QueryPanel__saved-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-0-5) var(--space-2);
    font-size: var(--text-xs);
    background-color: var(--muted);
    color: var(--muted-foreground);
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
  }

  .QueryPanel__saved-item:hover {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  .QueryPanel__saved-item--active {
    border-color: var(--ring);
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  .QueryPanel__saved-name {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .QueryPanel__saved-delete {
    font-size: var(--text-xs);
    line-height: 1;
    color: var(--muted-foreground);
    opacity: 0.6;
    padding: 0 2px;
  }

  .QueryPanel__saved-delete:hover {
    opacity: 1;
    color: var(--destructive);
  }

  .QueryPanel__results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .QueryPanel__meta {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }

  .QueryPanel__view-toggle {
    display: flex;
    gap: 2px;
  }

  .QueryPanel__view-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
  }

  .QueryPanel__view-btn:hover {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  .QueryPanel__view-btn--active {
    background-color: var(--muted);
    color: var(--foreground);
  }

  .QueryPanel__results {
    flex: 1;
    overflow-y: auto;
  }
</style>
