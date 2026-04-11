<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";

  let { value = $bindable(), ...restProps }: HTMLTextareaAttributes = $props();
</script>

<textarea bind:value {...restProps}></textarea>
