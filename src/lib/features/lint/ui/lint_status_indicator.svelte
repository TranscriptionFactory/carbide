<script lang="ts">
  import { CircleAlert, TriangleAlert, CircleCheck } from "@lucide/svelte";

  interface Props {
    error_count: number;
    warning_count: number;
    is_running: boolean;
    on_click: () => void;
  }

  let { error_count, warning_count, is_running, on_click }: Props = $props();

  const has_errors = $derived(error_count > 0);
  const has_warnings = $derived(warning_count > 0);
  const has_issues = $derived(has_errors || has_warnings);
  const label = $derived.by(() => {
    if (!is_running) return "Lint stopped";
    if (!has_issues) return "No lint issues";
    const parts: string[] = [];
    if (has_errors)
      parts.push(`${error_count} error${error_count > 1 ? "s" : ""}`);
    if (has_warnings)
      parts.push(`${warning_count} warning${warning_count > 1 ? "s" : ""}`);
    return parts.join(", ");
  });
</script>

{#if is_running}
  <button
    type="button"
    class="LintIndicator"
    class:LintIndicator--clean={!has_issues}
    class:LintIndicator--errors={has_errors}
    class:LintIndicator--warnings={has_warnings && !has_errors}
    onclick={on_click}
    aria-label={label}
    title={label}
  >
    {#if has_errors}
      <CircleAlert class="LintIndicator__icon" />
      <span>{error_count}</span>
    {/if}
    {#if has_warnings}
      <TriangleAlert class="LintIndicator__icon" />
      <span>{warning_count}</span>
    {/if}
    {#if !has_issues}
      <CircleCheck class="LintIndicator__icon" />
    {/if}
  </button>
{/if}

<style>
  .LintIndicator {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-feature-settings: "tnum" 1;
    color: var(--muted-foreground);
    opacity: 0.7;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .LintIndicator:hover {
    opacity: 1;
    color: var(--interactive);
  }

  .LintIndicator:focus-visible {
    opacity: 1;
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }

  .LintIndicator--errors {
    color: var(--destructive);
    opacity: 0.85;
  }

  .LintIndicator--errors:hover {
    color: var(--destructive);
    opacity: 1;
  }

  .LintIndicator--warnings {
    color: var(--warning, oklch(0.75 0.15 85));
    opacity: 0.85;
  }

  .LintIndicator--warnings:hover {
    color: var(--warning, oklch(0.75 0.15 85));
    opacity: 1;
  }

  .LintIndicator--clean {
    opacity: 0.5;
  }

  :global(.LintIndicator__icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }
</style>
