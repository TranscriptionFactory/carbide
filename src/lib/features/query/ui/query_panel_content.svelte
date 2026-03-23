<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";

  const { stores, action_registry } = use_app_context();

  let input_value = $state(stores.query.query_text || "");
  const status = $derived(stores.query.status);
  const result = $derived(stores.query.result);
  const error = $derived(stores.query.error);

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
  </div>

  {#if error}
    <div class="QueryPanel__error">
      {error.message}
    </div>
  {/if}

  {#if result}
    <div class="QueryPanel__meta">
      {result.total} result{result.total === 1 ? "" : "s"} in {result.elapsed_ms}ms
    </div>
    <div class="QueryPanel__results">
      {#each result.items as item (item.note.path)}
        <button
          type="button"
          class="QueryPanel__result"
          onclick={() => open_note(item.note.path)}
          title={item.note.path}
        >
          <span class="QueryPanel__result-title">{item.note.title}</span>
          <span class="QueryPanel__result-path">{item.note.path}</span>
        </button>
      {:else}
        <div class="QueryPanel__empty">No results</div>
      {/each}
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

  .QueryPanel__error {
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    color: var(--destructive);
    background-color: var(--destructive-foreground, oklch(0.95 0.01 25));
    border-radius: var(--radius-sm);
  }

  .QueryPanel__meta {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .QueryPanel__results {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .QueryPanel__result {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    text-align: left;
    border-radius: var(--radius-sm);
    color: var(--foreground);
  }

  .QueryPanel__result:hover {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  .QueryPanel__result-title {
    font-weight: 500;
    flex-shrink: 0;
  }

  .QueryPanel__result-path {
    color: var(--muted-foreground);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .QueryPanel__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }
</style>
