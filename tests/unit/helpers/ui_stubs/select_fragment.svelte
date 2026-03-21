<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    id?: string;
    class?: string;
    children?: Snippet;
  }

  let { id, class: class_name = "", children }: Props = $props();
</script>

<div {id} class={class_name}>
  {@render children?.()}
</div>
