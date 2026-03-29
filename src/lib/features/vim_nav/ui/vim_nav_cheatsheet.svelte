<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { ALL_BINDINGS } from "$lib/features/vim_nav/domain/vim_nav_keymap";

  type Props = {
    open: boolean;
    on_open_change: (open: boolean) => void;
  };

  let { open, on_open_change }: Props = $props();
</script>

<Dialog.Root {open} onOpenChange={on_open_change}>
  <Dialog.Content class="VimNavCheatsheet">
    <Dialog.Header class="sr-only">
      <Dialog.Title>Vim Navigation Cheat Sheet</Dialog.Title>
      <Dialog.Description>
        Keyboard shortcuts for vim-style app navigation
      </Dialog.Description>
    </Dialog.Header>

    <div class="VimNavCheatsheet__header">
      <h2 class="VimNavCheatsheet__title">Vim Navigation</h2>
      <span class="VimNavCheatsheet__hint"
        >Press <kbd>?</kbd> or <kbd>Esc</kbd> to close</span
      >
    </div>

    <div class="VimNavCheatsheet__grid">
      {#each ALL_BINDINGS as group}
        <div class="VimNavCheatsheet__section">
          <h3 class="VimNavCheatsheet__section-header">{group.label}</h3>
          <div class="VimNavCheatsheet__bindings">
            {#each group.bindings as binding}
              <div class="VimNavCheatsheet__row">
                <kbd class="VimNavCheatsheet__key">{binding.sequence}</kbd>
                <span class="VimNavCheatsheet__label">{binding.label}</span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.VimNavCheatsheet) {
    max-width: 640px !important;
    max-height: 80vh !important;
    overflow-y: auto;
    padding: 1.25rem !important;
  }

  .VimNavCheatsheet__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid hsl(var(--border));
  }

  .VimNavCheatsheet__title {
    font-size: 1rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .VimNavCheatsheet__hint {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .VimNavCheatsheet__hint kbd {
    display: inline-block;
    padding: 0.1rem 0.35rem;
    font-size: 0.7rem;
    font-family: inherit;
    border: 1px solid hsl(var(--border));
    border-radius: 4px;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .VimNavCheatsheet__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
  }

  .VimNavCheatsheet__section-header {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground));
    margin-bottom: 0.5rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid hsl(var(--border) / 0.5);
  }

  .VimNavCheatsheet__bindings {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .VimNavCheatsheet__row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.2rem 0;
  }

  .VimNavCheatsheet__row:hover {
    background: hsl(var(--muted) / 0.5);
    border-radius: 4px;
  }

  .VimNavCheatsheet__key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    padding: 0.15rem 0.4rem;
    font-size: 0.75rem;
    font-family: var(--font-mono, monospace);
    font-weight: 500;
    border: 1px solid hsl(var(--border));
    border-radius: 4px;
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
    white-space: nowrap;
    flex-shrink: 0;
  }

  .VimNavCheatsheet__label {
    font-size: 0.8rem;
    color: hsl(var(--foreground) / 0.85);
  }
</style>
