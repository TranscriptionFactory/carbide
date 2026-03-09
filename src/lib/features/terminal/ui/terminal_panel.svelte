<script lang="ts">
  import OptionalSurface from "$lib/shared/ui/optional_surface.svelte";

  const component_props = {};
  const load_terminal_panel = () =>
    import("$lib/features/terminal/ui/terminal_panel_content.svelte");
</script>

<OptionalSurface
  loader={load_terminal_panel}
  {component_props}
  loading_label="Loading terminal…"
  error_label="Failed to load terminal"
/>
