<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Command from "@lucide/svelte/icons/command";
  import Bot from "@lucide/svelte/icons/bot";
  import Search from "@lucide/svelte/icons/search";
  import BookOpen from "@lucide/svelte/icons/book-open";
  import Gauge from "@lucide/svelte/icons/gauge";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import X from "@lucide/svelte/icons/x";

  type Props = {
    open: boolean;
    has_vault: boolean;
    ai_configured: boolean;
    on_close: () => void;
    on_choose_vault: () => void;
    on_open_help: () => void;
    on_open_settings: (category: string) => void;
    on_open_omnibar: () => void;
    on_open_docs: (url: string) => void;
    on_open_dashboard: () => void;
  };

  let {
    open,
    has_vault,
    ai_configured,
    on_close,
    on_choose_vault,
    on_open_help,
    on_open_settings,
    on_open_omnibar,
    on_open_docs,
    on_open_dashboard,
  }: Props = $props();

  const docs_links = [
    {
      label: "Getting started guide",
      url: "https://github.com/TranscriptionFactory/carbide/blob/main/docs/getting_started.md",
    },
    {
      label: "Architecture map",
      url: "https://github.com/TranscriptionFactory/carbide/blob/main/docs/architecture.md",
    },
  ];

  function handle_open_change(value: boolean) {
    if (!value) {
      on_close();
    }
  }
</script>

<Dialog.Root {open} onOpenChange={handle_open_change}>
  <Dialog.Content class="WelcomeDialogShell" showCloseButton={false}>
    <div class="WelcomeDialog">
      <Dialog.Close class="WelcomeDialog__close" aria-label="Close">
        <X />
      </Dialog.Close>

      <Dialog.Header class="sr-only">
        <Dialog.Title>Welcome to Carbide</Dialog.Title>
        <Dialog.Description>
          Quick steps to get productive on first open.
        </Dialog.Description>
      </Dialog.Header>

      <div class="WelcomeDialog__hero">
        <div class="WelcomeDialog__eyebrow">
          <span class="WelcomeDialog__eyebrow-icon">
            <Sparkles />
          </span>
          Local-first, graph-native knowledge studio
        </div>
        <div class="WelcomeDialog__headline">
          <div class="WelcomeDialog__icon">
            <Sparkles />
          </div>
          <div>
            <h2>Welcome to Carbide</h2>
            <p>
              Carbide layers semantic search, programmable actions, and
              AI-assisted writing on top of local Markdown vaults with Git-aware
              workflows.
            </p>
          </div>
        </div>
        <div class="WelcomeDialog__chips">
          <span>Hybrid FTS + embeddings + graph</span>
          <span>Action registry for every interaction</span>
          <span>Programmable plugins & toolchain</span>
          <span>AI inline commands with vault context</span>
        </div>
      </div>

      <div class="WelcomeDialog__grid">
        <section class="WelcomeDialog__card">
          <div class="WelcomeDialog__card-header">
            <div
              class="WelcomeDialog__card-icon WelcomeDialog__card-icon--teal"
            >
              <FolderOpen />
            </div>
            <div>
              {#if has_vault}
                <p
                  class="WelcomeDialog__card-kicker WelcomeDialog__card-kicker--done"
                >
                  <CircleCheck size={14} /> Done
                </p>
              {:else}
                <p class="WelcomeDialog__card-kicker">Step 1</p>
              {/if}
              <h3>Anchor a vault</h3>
            </div>
          </div>
          <p class="WelcomeDialog__card-body">
            Vaults keep notes, canvases, references, and caches together. Pin
            the paths you use daily and surface them in the dashboard.
          </p>
          <div class="WelcomeDialog__actions">
            <Button
              size="sm"
              variant={has_vault ? "secondary" : "default"}
              onclick={on_choose_vault}
            >
              Choose a vault
            </Button>
            {#if has_vault}
              <Button variant="secondary" size="sm" onclick={on_open_dashboard}>
                Open vault dashboard
              </Button>
            {/if}
          </div>
        </section>

        <section
          class="WelcomeDialog__card"
          class:WelcomeDialog__card--gated={!has_vault}
        >
          <div class="WelcomeDialog__card-header">
            <div
              class="WelcomeDialog__card-icon WelcomeDialog__card-icon--amber"
            >
              <Command />
            </div>
            <div>
              <p class="WelcomeDialog__card-kicker">Step 2</p>
              <h3>Command everything</h3>
            </div>
          </div>
          {#if !has_vault}
            <p class="WelcomeDialog__card-gate-label">Open a vault first</p>
          {/if}
          <p class="WelcomeDialog__card-body">
            The omnibar and hotkeys drive every action: open notes, run
            commands, or jump between tabs. The help sheet lists defaults and
            search syntax.
          </p>
          <div class="WelcomeDialog__actions">
            <Button variant="secondary" size="sm" onclick={on_open_omnibar}>
              <span class="WelcomeDialog__inline-icon"><Search /></span>
              Open omnibar
            </Button>
            <Button variant="ghost" size="sm" onclick={on_open_help}>
              View shortcuts
            </Button>
          </div>
        </section>

        <section
          class="WelcomeDialog__card"
          class:WelcomeDialog__card--gated={!has_vault}
        >
          <div class="WelcomeDialog__card-header">
            <div
              class="WelcomeDialog__card-icon WelcomeDialog__card-icon--purple"
            >
              <Bot />
            </div>
            <div>
              {#if ai_configured}
                <p
                  class="WelcomeDialog__card-kicker WelcomeDialog__card-kicker--done"
                >
                  <CircleCheck size={14} /> Done
                </p>
              {:else}
                <p class="WelcomeDialog__card-kicker">Step 3</p>
              {/if}
              <h3>Wire up AI & graph</h3>
            </div>
          </div>
          {#if !has_vault}
            <p class="WelcomeDialog__card-gate-label">Open a vault first</p>
          {/if}
          <p class="WelcomeDialog__card-body">
            Enable inline AI commands, semantic search, and graph semantics.
            Tune providers, embeddings, and diagnostics before you start
            writing.
          </p>
          <div class="WelcomeDialog__actions">
            <Button
              variant="secondary"
              size="sm"
              onclick={() => on_open_settings("ai")}
            >
              <span class="WelcomeDialog__inline-icon"><Gauge /></span>
              Configure AI
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => on_open_settings("semantic")}
            >
              Graph & search settings
            </Button>
          </div>
        </section>
      </div>

      <Separator />

      <div class="WelcomeDialog__footer">
        <div class="WelcomeDialog__footer-left">
          <span class="WelcomeDialog__footer-icon"><BookOpen /></span>
          <div>
            <p class="WelcomeDialog__footer-title">Dig deeper</p>
            <p class="WelcomeDialog__footer-copy">
              Quick references for the decision tree, plugin system, and
              workflows.
            </p>
          </div>
        </div>
        <div class="WelcomeDialog__footer-actions">
          {#each docs_links as link (link.url)}
            <Button
              variant="ghost"
              size="sm"
              onclick={() => on_open_docs(link.url)}
            >
              {link.label}
            </Button>
          {/each}
        </div>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.WelcomeDialogShell) {
    padding: 0;
    border: none;
    background: transparent;
    box-shadow: none;
    max-width: none;
    width: auto;
  }

  .WelcomeDialog {
    position: relative;
    width: min(960px, 90vw);
    max-width: min(960px, 90vw);
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    background:
      radial-gradient(
        circle at 20% 20%,
        rgba(0, 168, 150, 0.12),
        transparent 45%
      ),
      radial-gradient(
        circle at 80% 0%,
        rgba(120, 97, 255, 0.12),
        transparent 40%
      ),
      var(--card);
    border: 1px solid var(--border);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.25);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
  }

  :global(.WelcomeDialog__close) {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 150ms;
    z-index: 1;
  }

  :global(.WelcomeDialog__close:hover) {
    opacity: 1;
  }

  .WelcomeDialog__hero {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    background:
      linear-gradient(135deg, var(--interactive-bg), transparent 40%),
      color-mix(in srgb, var(--muted) 80%, var(--background));
    border: 1px solid var(--border);
  }

  .WelcomeDialog__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: 999px;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    letter-spacing: 0.01em;
  }

  .WelcomeDialog__eyebrow-icon {
    width: var(--size-icon);
    height: var(--size-icon);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .WelcomeDialog__headline {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--space-3);
  }

  .WelcomeDialog__headline h2 {
    margin: 0;
    font-size: 1.4rem;
    line-height: 1.2;
  }

  .WelcomeDialog__headline p {
    margin: var(--space-1) 0 0;
    color: var(--muted-foreground);
    max-width: 54ch;
  }

  .WelcomeDialog__icon {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    background: radial-gradient(
      circle at 25% 25%,
      rgba(0, 168, 150, 0.25),
      rgba(0, 168, 150, 0.05)
    );
    color: var(--interactive);
  }

  .WelcomeDialog__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .WelcomeDialog__chips span {
    padding: var(--space-1) var(--space-2);
    border-radius: 999px;
    border: 1px solid var(--interactive-bg);
    background: color-mix(in srgb, var(--interactive-bg) 50%, transparent);
    color: var(--interactive);
    font-size: var(--text-sm);
  }

  .WelcomeDialog__grid {
    display: grid;
    gap: var(--space-3);
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .WelcomeDialog__card {
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--card);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
    transition: opacity 200ms;
  }

  .WelcomeDialog__card--gated {
    opacity: 0.45;
    pointer-events: none;
  }

  .WelcomeDialog__card-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .WelcomeDialog__card-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: var(--muted);
    color: var(--foreground);
  }

  .WelcomeDialog__card-icon--teal {
    background: color-mix(in srgb, var(--interactive-bg) 70%, transparent);
    color: var(--interactive);
  }

  .WelcomeDialog__card-icon--amber {
    background: color-mix(
      in srgb,
      var(--warning-foreground, #d97706) 20%,
      var(--muted)
    );
    color: var(--warning-foreground, #d97706);
  }

  .WelcomeDialog__card-icon--purple {
    background: color-mix(in srgb, #a855f7 25%, var(--muted));
    color: #a855f7;
  }

  .WelcomeDialog__card-kicker {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    letter-spacing: 0.02em;
  }

  .WelcomeDialog__card-kicker--done {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--interactive);
  }

  .WelcomeDialog__card-gate-label {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    font-style: italic;
  }

  .WelcomeDialog__card h3 {
    margin: 0;
    font-size: 1.05rem;
  }

  .WelcomeDialog__card-body {
    margin: 0;
    color: var(--muted-foreground);
    line-height: 1.5;
  }

  .WelcomeDialog__actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .WelcomeDialog__inline-icon {
    width: var(--size-icon);
    height: var(--size-icon);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .WelcomeDialog__footer {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-1) 0;
  }

  .WelcomeDialog__footer-left {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .WelcomeDialog__footer-icon {
    width: 32px;
    height: 32px;
    color: var(--interactive);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .WelcomeDialog__footer-title {
    margin: 0;
    font-weight: 600;
  }

  .WelcomeDialog__footer-copy {
    margin: var(--space-1) 0 0;
    color: var(--muted-foreground);
  }

  .WelcomeDialog__footer-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  @media (max-width: 720px) {
    .WelcomeDialog__headline {
      grid-template-columns: 1fr;
    }

    .WelcomeDialog__footer {
      grid-template-columns: 1fr;
      justify-items: flex-start;
    }

    .WelcomeDialog__footer-actions {
      justify-content: flex-start;
    }
  }
</style>
