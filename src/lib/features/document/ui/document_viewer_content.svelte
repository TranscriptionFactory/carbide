<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import type {
    DocumentContentState,
    DocumentViewerState,
  } from "$lib/features/document/state/document_store.svelte";
  import PdfViewer from "$lib/features/document/ui/pdf_viewer.svelte";
  import ImageViewer from "$lib/features/document/ui/image_viewer.svelte";
  import DocumentEditor from "$lib/features/document/ui/document_editor.svelte";
  import HtmlViewer from "$lib/features/document/ui/html_viewer.svelte";
  import { CanvasViewer } from "$lib/features/canvas";
  import type { PdfMetadata } from "$lib/features/document/types/document";
  import CodeIcon from "@lucide/svelte/icons/code";
  import EyeIcon from "@lucide/svelte/icons/eye";

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
  const is_html = $derived(viewer_state.file_type === "html");
  const html_source_mode = $derived(
    is_html && viewer_state.html_view_mode === "source",
  );

  function handle_pdf_metadata(metadata: PdfMetadata): void {
    stores.document.set_pdf_metadata(viewer_state.tab_id, metadata);
  }

  function handle_editor_change(new_content: string): void {
    stores.document.set_edited_content(viewer_state.tab_id, new_content);
    stores.tab.set_dirty(viewer_state.tab_id, true);
  }

  function toggle_html_view_mode(): void {
    stores.document.toggle_html_view_mode(viewer_state.tab_id);
  }
</script>

<div class="DocumentViewer">
  {#if is_html && current_content !== null}
    <div class="DocumentViewer__toolbar">
      <button
        type="button"
        class="DocumentViewer__toggle-btn"
        class:DocumentViewer__toggle-btn--active={!html_source_mode}
        onclick={toggle_html_view_mode}
        aria-label={html_source_mode
          ? "Switch to visual view"
          : "Switch to source view"}
      >
        {#if html_source_mode}
          <EyeIcon />
          <span>Visual</span>
        {:else}
          <CodeIcon />
          <span>Source</span>
        {/if}
      </button>
    </div>
  {/if}

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
  {:else if is_html && current_content !== null}
    {#if html_source_mode}
      {#key `${viewer_state.tab_id}:${viewer_state.file_path}:${stores.ui.editor_settings.document_code_wrap ? "wrap" : "nowrap"}`}
        <DocumentEditor
          content={current_content}
          filename={viewer_state.file_path.split("/").pop() ?? ""}
          on_change={handle_editor_change}
          wrap_lines={stores.ui.editor_settings.document_code_wrap}
        />
      {/key}
    {:else}
      <HtmlViewer
        content={current_content}
        theme={stores.ui.active_theme.color_scheme}
      />
    {/if}
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

  .DocumentViewer__toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .DocumentViewer__toggle-btn {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .DocumentViewer__toggle-btn:hover {
    background-color: var(--muted);
    color: var(--foreground);
  }

  :global(.DocumentViewer__toggle-btn svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
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
