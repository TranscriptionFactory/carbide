<script lang="ts">
  type Props = {
    staged_count: number;
    on_commit: (message: string) => void;
  };

  let { staged_count, on_commit }: Props = $props();

  let message = $state("");

  const can_commit = $derived(staged_count > 0 && message.trim().length > 0);

  function handle_commit() {
    if (!can_commit) return;
    on_commit(message.trim());
    message = "";
  }

  function handle_keydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && can_commit) {
      e.preventDefault();
      handle_commit();
    }
  }
</script>

<div class="CommitComposer">
  <textarea
    class="CommitComposer__input"
    placeholder="Checkpoint message..."
    bind:value={message}
    onkeydown={handle_keydown}
    rows={2}
  ></textarea>
  <button
    type="button"
    class="CommitComposer__button"
    disabled={!can_commit}
    onclick={handle_commit}
  >
    Checkpoint {staged_count} file{staged_count !== 1 ? "s" : ""}
  </button>
</div>

<style>
  .CommitComposer {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
    padding: var(--space-2);
    border-block-start: 1px solid var(--border);
    background-color: var(--sidebar);
  }

  .CommitComposer__input {
    width: 100%;
    padding: var(--space-1-5) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background-color: var(--background);
    color: var(--foreground);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    resize: none;
    outline: none;
  }

  .CommitComposer__input:focus {
    border-color: var(--interactive);
    box-shadow: 0 0 0 1px var(--interactive);
  }

  .CommitComposer__input::placeholder {
    color: var(--muted-foreground);
  }

  .CommitComposer__button {
    width: 100%;
    padding: var(--space-1-5);
    border-radius: var(--radius-sm);
    background-color: var(--interactive);
    color: var(--interactive-text-on-bg);
    font-size: var(--text-xs);
    font-weight: 500;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .CommitComposer__button:hover:not(:disabled) {
    opacity: 0.9;
  }

  .CommitComposer__button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
