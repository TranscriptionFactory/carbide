<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    child?: Snippet<[input: { props: Record<string, unknown> }]>;
    children?: Snippet;
  }

  let { child, children }: Props = $props();
</script>

{#if child}
  {@render child({ props: {} })}
{:else}
  {@render children?.()}
{/if}
