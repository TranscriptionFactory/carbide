<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    open?: boolean;
    onOpenChange?: (value: boolean) => void;
    children?: Snippet;
  }

  let {
    open = true,
    onOpenChange: _on_open_change,
    children,
  }: Props = $props();
</script>

{#if open}
  <div data-testid="popover-root">
    {@render children?.()}
  </div>
{/if}
