<script lang="ts">
  import type { DocumentViewerState } from "$lib/features/document/state/document_store.svelte";
  import PdfViewer from "$lib/features/document/ui/pdf_viewer.svelte";
  import CsvViewer from "$lib/features/document/ui/csv_viewer.svelte";
  import ImageViewer from "$lib/features/document/ui/image_viewer.svelte";
  import CodeViewer from "$lib/features/document/ui/code_viewer.svelte";

  interface Props {
    viewer_state: DocumentViewerState;
  }

  let { viewer_state }: Props = $props();
</script>

<div class="DocumentViewer">
  {#if viewer_state.file_type === "pdf" && viewer_state.asset_url}
    <PdfViewer src={viewer_state.asset_url} />
  {:else if viewer_state.file_type === "image" && viewer_state.asset_url}
    <ImageViewer src={viewer_state.asset_url} />
  {:else if viewer_state.file_type === "csv" && viewer_state.content !== null}
    <CsvViewer content={viewer_state.content} />
  {:else if (viewer_state.file_type === "code" || viewer_state.file_type === "text") && viewer_state.content !== null}
    <CodeViewer
      content={viewer_state.content}
      file_type={viewer_state.file_type}
      filename={viewer_state.file_path.split("/").pop() ?? ""}
    />
  {:else}
    <div class="DocumentViewer__loading">
      <span>Loading…</span>
    </div>
  {/if}
</div>

<style>
  .DocumentViewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .DocumentViewer__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }
</style>
