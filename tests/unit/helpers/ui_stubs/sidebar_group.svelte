<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    class?: string;
    hidden?: boolean;
    children?: Snippet;
  }

  let { class: class_name = "", hidden = false, children }: Props = $props();
</script>

<div class={class_name} {hidden} data-testid="sidebar-group">
  {@render children?.()}
</div>
