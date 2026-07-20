<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    onSelect?: () => void;
    disabled?: boolean;
    children?: Snippet;
    [key: string]: unknown;
  }

  let { onSelect, disabled = false, children, ...rest }: Props = $props();
</script>

<button type="button" {...rest} {disabled} onclick={() => onSelect?.()}>
  {@render children?.()}
</button>
