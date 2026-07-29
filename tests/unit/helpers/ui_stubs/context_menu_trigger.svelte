<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  }

  let { class: class_name = "", children, ...rest }: Props = $props();
</script>

<div data-testid="context-menu-trigger" class={class_name} {...rest}>
  {@render children?.()}
</div>
