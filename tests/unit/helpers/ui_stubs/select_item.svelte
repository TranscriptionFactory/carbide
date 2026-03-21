<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    value: string;
    children?: Snippet;
  }

  let { value, children }: Props = $props();
</script>

<button type="button" data-value={value}>
  {@render children?.()}
</button>
