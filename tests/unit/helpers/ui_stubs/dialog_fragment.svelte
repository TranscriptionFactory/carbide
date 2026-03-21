<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    class?: string;
    children?: Snippet;
  }

  let { class: class_name = "", children }: Props = $props();
</script>

<div class={class_name}>
  {@render children?.()}
</div>
