<script lang="ts">
  import { Mic, Loader } from "@lucide/svelte";

  interface Props {
    enabled: boolean;
    recording_state: "idle" | "recording" | "processing";
    model_loading: boolean;
    has_model: boolean;
    on_click: () => void;
    on_settings_click: () => void;
  }

  let {
    enabled,
    recording_state,
    model_loading,
    has_model,
    on_click,
    on_settings_click,
  }: Props = $props();

  const is_recording = $derived(recording_state === "recording");
  const is_processing = $derived(recording_state === "processing");
  const label = $derived.by(() => {
    if (!enabled) return "Speech-to-text disabled";
    if (model_loading) return "Loading speech model…";
    if (is_recording) return "Recording — click to stop";
    if (is_processing) return "Transcribing…";
    if (!has_model) return "No speech model — click to configure";
    return "Speech-to-text ready — click to record";
  });
</script>

{#if enabled}
  <button
    type="button"
    class="SttIndicator"
    class:SttIndicator--recording={is_recording}
    class:SttIndicator--processing={is_processing || model_loading}
    class:SttIndicator--no-model={!has_model && !model_loading}
    onclick={has_model || is_recording ? on_click : on_settings_click}
    aria-label={label}
    title={label}
  >
    {#if is_processing || model_loading}
      <Loader class="SttIndicator__icon SttIndicator__spinner" />
    {:else}
      <Mic class="SttIndicator__icon" />
      {#if is_recording}
        <span class="SttIndicator__pulse"></span>
      {/if}
    {/if}
  </button>
{/if}

<style>
  .SttIndicator {
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

  .SttIndicator:hover {
    opacity: 1;
    color: var(--interactive);
  }

  .SttIndicator:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .SttIndicator--recording {
    color: var(--destructive);
    opacity: 1;
    position: relative;
  }

  .SttIndicator--recording:hover {
    color: var(--destructive);
    opacity: 1;
  }

  .SttIndicator__pulse {
    position: absolute;
    inset: 0;
    border-radius: var(--radius-sm);
    background: var(--destructive);
    opacity: 0;
    pointer-events: none;
    animation: stt-pulse 1.5s ease-in-out infinite;
  }

  @keyframes stt-pulse {
    0%,
    100% {
      opacity: 0;
      transform: scale(1);
    }
    50% {
      opacity: 0.2;
      transform: scale(1.3);
    }
  }

  .SttIndicator--processing {
    color: var(--primary);
    opacity: 0.85;
  }

  .SttIndicator--no-model {
    opacity: 0.4;
  }

  :global(.SttIndicator__icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  :global(.SttIndicator__spinner) {
    animation: stt-spin 1s linear infinite;
  }

  @keyframes stt-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
