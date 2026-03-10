<script lang="ts">
  import OptionalSurface from "$lib/shared/ui/optional_surface.svelte";
  import type {
    DocumentContentState,
    DocumentViewerState,
  } from "$lib/features/document/state/document_store.svelte";

  type DocumentViewerProps = {
    viewer_state: DocumentViewerState;
    content_state: DocumentContentState | undefined;
  };

  let { viewer_state, content_state }: DocumentViewerProps = $props();

  const load_document_viewer = () =>
    import("$lib/features/document/ui/document_viewer_content.svelte");
</script>

<OptionalSurface
  loader={load_document_viewer}
  component_props={{ viewer_state, content_state }}
  loading_label="Loading document…"
  error_label="Failed to load document viewer"
/>
