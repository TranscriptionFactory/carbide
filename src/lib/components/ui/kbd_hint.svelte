<script lang="ts">
  import { is_mac } from "$lib/features/window";
</script>

<kbd
  class="pointer-events-none ml-1 rounded border px-1 font-mono text-xs opacity-70"
  aria-hidden="true"
>
  {is_mac() ? "⌘↩" : "Ctrl+↩"}
</kbd>
