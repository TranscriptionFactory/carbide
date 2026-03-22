<script lang="ts">
  import { Zap, ZapOff, Loader } from "@lucide/svelte";
  import type { IweStatus } from "$lib/features/iwe/types";

  interface Props {
    status: IweStatus;
    error: string | null;
    onclick?: () => void;
  }

  let { status, error, onclick }: Props = $props();

  const label = $derived.by(() => {
    switch (status) {
      case "running":
        return "IWE: Connected";
      case "starting":
        return "IWE: Starting...";
      case "error":
        return `IWE: Error — ${error ?? "unknown"}`;
      default:
        return "IWE: Disconnected";
    }
  });
</script>

{#snippet icon_content()}
  {#if status === "running"}
    <Zap class="IweIndicator__icon" />
  {:else if status === "starting"}
    <Loader class="IweIndicator__icon IweIndicator__icon--spin" />
  {:else}
    <ZapOff class="IweIndicator__icon" />
  {/if}
  <span>IWE</span>
{/snippet}

{#if status !== "idle"}
  {#if onclick}
    <button
      type="button"
      class="IweIndicator"
      class:IweIndicator--running={status === "running"}
      class:IweIndicator--error={status === "error"}
      class:IweIndicator--starting={status === "starting"}
      {onclick}
      aria-label={label}
      title={label}
    >
      {@render icon_content()}
    </button>
  {:else}
    <span
      class="IweIndicator"
      class:IweIndicator--running={status === "running"}
      class:IweIndicator--error={status === "error"}
      class:IweIndicator--starting={status === "starting"}
      aria-label={label}
      title={label}
    >
      {@render icon_content()}
    </span>
  {/if}
{/if}

<style>
  .IweIndicator {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    opacity: 0.7;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  button.IweIndicator {
    cursor: pointer;
  }

  button.IweIndicator:hover {
    opacity: 1;
    color: var(--interactive);
  }

  button.IweIndicator:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .IweIndicator--running {
    color: var(--success, oklch(0.65 0.2 145));
    opacity: 0.85;
  }

  .IweIndicator--error {
    color: var(--destructive);
    opacity: 0.85;
  }

  .IweIndicator--starting {
    opacity: 0.6;
  }

  :global(.IweIndicator__icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  :global(.IweIndicator__icon--spin) {
    animation: iwe-spin 1s linear infinite;
  }

  @keyframes iwe-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
