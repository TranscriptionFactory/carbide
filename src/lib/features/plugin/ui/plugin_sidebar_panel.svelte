<script lang="ts">
  interface Props {
    plugin_id?: string | undefined;
    label?: string | undefined;
  }
  let { plugin_id = "", label = "Plugin Panel" }: Props = $props();
</script>

<div class="flex flex-col h-full">
  <div class="px-4 py-2 border-b">
    <h2 class="text-sm font-semibold">{label}</h2>
  </div>
  <div
    class="flex-1 flex items-center justify-center text-muted-foreground text-sm"
  >
    Plugin panel: {plugin_id}
  </div>
</div>
