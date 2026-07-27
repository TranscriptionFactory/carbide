<script lang="ts">
  const is_mac =
    typeof navigator !== "undefined" && navigator.platform.includes("Mac");
</script>

<kbd
  class="pointer-events-none ml-1 rounded border border-current/30 px-1 font-mono text-[10px] opacity-70"
  aria-hidden="true"
>
  {is_mac ? "⌘↩" : "Ctrl+↩"}
</kbd>
