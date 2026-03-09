<script lang="ts">
  import type {
    DocumentContentState,
    DocumentViewerState,
  } from "$lib/features/document/state/document_store.svelte";
  import PdfViewer from "$lib/features/document/ui/pdf_viewer.svelte";
  import CsvViewer from "$lib/features/document/ui/csv_viewer.svelte";
  import ImageViewer from "$lib/features/document/ui/image_viewer.svelte";
  import CodeViewer from "$lib/features/document/ui/code_viewer.svelte";

  interface Props {
    viewer_state: DocumentViewerState;
    content_state: DocumentContentState | undefined;
  }

  let { viewer_state, content_state }: Props = $props();
  const asset_url = $derived(content_state?.asset_url ?? null);
  const content = $derived(content_state?.content ?? null);
</script>

<div class="DocumentViewer">
  {#if viewer_state.file_type === "pdf" && asset_url}
    <PdfViewer src={asset_url} />
  {:else if viewer_state.file_type === "image" && asset_url}
    <ImageViewer src={asset_url} />
  {:else if viewer_state.file_type === "csv" && content !== null}
    <CsvViewer {content} />
  {:else if (viewer_state.file_type === "code" || viewer_state.file_type === "text") && content !== null}
    <CodeViewer
      {content}
      file_type={viewer_state.file_type}
      filename={viewer_state.file_path.split("/").pop() ?? ""}
    />
  {:else if viewer_state.load_status === "error"}
    <div class="DocumentViewer__state DocumentViewer__state--error">
      <span>{viewer_state.error_message ?? "Failed to load document"}</span>
    </div>
  {:else}
    <div class="DocumentViewer__state">
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

  .DocumentViewer__state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .DocumentViewer__state--error {
    color: var(--destructive);
  }
</style>
