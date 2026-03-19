<script lang="ts">
  import OptionalSurface from "$lib/shared/ui/optional_surface.svelte";

  const component_props = {};
  const load_problems_panel = () =>
    import("$lib/features/lint/ui/problems_panel_content.svelte");
</script>

<OptionalSurface
  loader={load_problems_panel}
  {component_props}
  loading_label="Loading problems panel…"
  error_label="Failed to load problems panel"
/>
