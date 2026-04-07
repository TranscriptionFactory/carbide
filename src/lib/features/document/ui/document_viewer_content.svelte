<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import type {
    DocumentContentState,
    DocumentViewerState,
  } from "$lib/features/document/state/document_store.svelte";
  import PdfViewer from "$lib/features/document/ui/pdf_viewer.svelte";
  import ImageViewer from "$lib/features/document/ui/image_viewer.svelte";
  import DocumentEditor from "$lib/features/document/ui/document_editor.svelte";
  import { CanvasViewer } from "$lib/features/canvas";
  import type { PdfMetadata } from "$lib/features/document/types/document";
  import { is_editable_type } from "$lib/features/document/types/document";

  interface Props {
    viewer_state: DocumentViewerState;
    content_state: DocumentContentState | undefined;
  }

  let { viewer_state, content_state }: Props = $props();
  const { stores } = use_app_context();
  const asset_url = $derived(content_state?.asset_url ?? null);
  const current_content = $derived(
    stores.document.get_current_content(viewer_state.tab_id),
  );

  function handle_pdf_metadata(metadata: PdfMetadata): void {
    stores.document.set_pdf_metadata(viewer_state.tab_id, metadata);
  }

  function handle_editor_change(new_content: string): void {
    stores.document.set_edited_content(viewer_state.tab_id, new_content);
    stores.tab.set_dirty(viewer_state.tab_id, true);
  }
</script>

<div class="DocumentViewer">
  {#if viewer_state.file_type === "canvas" || viewer_state.file_type === "excalidraw"}
    <CanvasViewer
      tab_id={viewer_state.tab_id}
      file_path={viewer_state.file_path}
      file_type={viewer_state.file_type}
    />
  {:else if viewer_state.file_type === "pdf" && asset_url}
    {#key `${viewer_state.file_path}:${stores.ui.editor_settings.document_pdf_scroll_mode}`}
      <PdfViewer
        src={asset_url}
        initial_page={viewer_state.pdf_page}
        default_zoom={stores.ui.editor_settings.document_pdf_default_zoom}
        scroll_mode={stores.ui.editor_settings.document_pdf_scroll_mode}
        on_metadata={handle_pdf_metadata}
      />
    {/key}
  {:else if viewer_state.file_type === "image" && asset_url}
    <ImageViewer
      src={asset_url}
      background_style={stores.ui.editor_settings.document_image_background}
    />
  {:else if viewer_state.file_type === "text" && current_content !== null}
    {#key `${viewer_state.tab_id}:${viewer_state.file_path}:${stores.ui.editor_settings.document_code_wrap ? "wrap" : "nowrap"}`}
      <DocumentEditor
        content={current_content}
        filename={viewer_state.file_path.split("/").pop() ?? ""}
        on_change={handle_editor_change}
        wrap_lines={stores.ui.editor_settings.document_code_wrap}
      />
    {/key}
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
