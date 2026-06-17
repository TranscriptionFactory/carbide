<script lang="ts">
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import type {
    DocumentContentState,
    DocumentViewerState,
  } from "$lib/features/document/state/document_store.svelte";
  import PdfViewer from "$lib/features/document/ui/pdf_viewer.svelte";
  import EpubViewer from "$lib/features/document/ui/epub_viewer.svelte";
  import ImageViewer from "$lib/features/document/ui/image_viewer.svelte";
  import DocumentEditor from "$lib/features/document/ui/document_editor.svelte";
  import HtmlViewer from "$lib/features/document/ui/html_viewer.svelte";
  import HtmlLiveRenderer from "$lib/features/document/ui/html_live_renderer.svelte";
  import TrustedHtmlDialog from "$lib/features/document/ui/trusted_html_dialog.svelte";
  import { format_provenance_banner } from "$lib/features/document/domain/html_artifact_paste";
  import { CanvasViewer } from "$lib/features/canvas";
  import type {
    HtmlViewMode,
    PdfMetadata,
  } from "$lib/features/document/types/document";
  import { format_bytes } from "$lib/shared/utils/format_bytes";
  import { parent_folder_path } from "$lib/shared/utils/path";
  import CodeIcon from "@lucide/svelte/icons/code";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import XIcon from "@lucide/svelte/icons/x";

  interface Props {
    viewer_state: DocumentViewerState;
    content_state: DocumentContentState | undefined;
  }

  let { viewer_state, content_state }: Props = $props();
  const { stores, services, action_registry } = use_app_context();
  const asset_url = $derived(content_state?.asset_url ?? null);
  const current_content = $derived(
    stores.document.get_current_content(viewer_state.tab_id),
  );
  const is_html = $derived(viewer_state.file_type === "html");
  const html_mode = $derived(viewer_state.html_view_mode);
  const trust_level = $derived(
    is_html ? stores.document.get_trust_level(viewer_state.file_path) : "safe",
  );
  const live_allowed = $derived(
    trust_level === "live" || trust_level === "live+net",
  );
  const allow_network = $derived(trust_level === "live+net");
  const provenance = $derived(
    is_html ? stores.document.get_provenance(viewer_state.file_path) : null,
  );
  const provenance_banner = $derived(
    provenance ? format_provenance_banner(provenance) : null,
  );

  $effect(() => {
    if (is_html) {
      void services.document.refresh_trust_level(viewer_state.file_path);
      void services.document.refresh_provenance(viewer_state.file_path);
    }
  });

  function clear_provenance(): void {
    void action_registry.execute(ACTION_IDS.document_clear_provenance);
  }

  function handle_pdf_metadata(metadata: PdfMetadata): void {
    stores.document.set_pdf_metadata(viewer_state.tab_id, metadata);
  }

  function handle_editor_change(new_content: string): void {
    stores.document.set_edited_content(viewer_state.tab_id, new_content);
    stores.tab.set_dirty(viewer_state.tab_id, true);
  }

  function handle_scroll_change(scroll_top: number): void {
    stores.document.update_scroll(viewer_state.tab_id, scroll_top);
  }

  function handle_epub_position_change(cfi: string): void {
    void action_registry.execute(ACTION_IDS.document_save_reading_position, {
      tab_id: viewer_state.tab_id,
      cfi,
    });
  }

  async function set_html_view_mode(mode: HtmlViewMode): Promise<void> {
    if (mode === "live" && !live_allowed) {
      const granted = await services.document.request_trust_grant(
        viewer_state.file_path,
      );
      if (!granted) return;
    }
    stores.document.set_html_view_mode(viewer_state.tab_id, mode);
  }
</script>

<div class="DocumentViewer">
  {#if is_html && current_content !== null}
    <div class="DocumentViewer__toolbar">
      <div
        class="DocumentViewer__mode-toggle"
        role="radiogroup"
        aria-label="HTML view mode"
      >
        <button
          type="button"
          class="DocumentViewer__mode-btn"
          class:DocumentViewer__mode-btn--active={html_mode === "source"}
          role="radio"
          aria-checked={html_mode === "source"}
          onclick={() => set_html_view_mode("source")}
        >
          <CodeIcon />
          <span>Source</span>
        </button>
        <button
          type="button"
          class="DocumentViewer__mode-btn"
          class:DocumentViewer__mode-btn--active={html_mode === "safe"}
          role="radio"
          aria-checked={html_mode === "safe"}
          onclick={() => set_html_view_mode("safe")}
        >
          <EyeIcon />
          <span>Safe</span>
        </button>
        <button
          type="button"
          class="DocumentViewer__mode-btn"
          class:DocumentViewer__mode-btn--active={html_mode === "live"}
          role="radio"
          aria-checked={html_mode === "live"}
          title={live_allowed
            ? "Run scripts (sandboxed)"
            : "Trust file to enable Live mode"}
          onclick={() => set_html_view_mode("live")}
        >
          <ZapIcon />
          <span>Live</span>
        </button>
      </div>
    </div>
    {#if provenance_banner}
      <div class="DocumentViewer__provenance" role="status">
        <span class="DocumentViewer__provenance-text">{provenance_banner}</span>
        <button
          type="button"
          class="DocumentViewer__provenance-clear"
          aria-label="Clear provenance metadata"
          title="Clear provenance metadata"
          onclick={clear_provenance}
        >
          <XIcon />
        </button>
      </div>
    {/if}
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
  {:else if viewer_state.file_type === "epub" && asset_url}
    {#key `${viewer_state.tab_id}:${viewer_state.file_path}`}
      <EpubViewer
        src={asset_url}
        theme={stores.ui.active_theme}
        initial_cfi={viewer_state.cfi}
        on_position_change={handle_epub_position_change}
      />
    {/key}
  {:else if viewer_state.file_type === "image" && asset_url}
    <ImageViewer
      src={asset_url}
      background_style={stores.ui.editor_settings.document_image_background}
    />
  {:else if is_html && current_content !== null}
    {#if html_mode === "source"}
      {#key `${viewer_state.tab_id}:${viewer_state.file_path}:${stores.ui.editor_settings.document_code_wrap ? "wrap" : "nowrap"}`}
        <DocumentEditor
          content={current_content}
          filename={viewer_state.file_path.split("/").pop() ?? ""}
          on_change={handle_editor_change}
          wrap_lines={stores.ui.editor_settings.document_code_wrap}
        />
      {/key}
    {:else if html_mode === "live" && live_allowed}
      <HtmlLiveRenderer
        content={current_content}
        theme={stores.ui.active_theme}
        {allow_network}
        asset_root={parent_folder_path(viewer_state.file_path)}
        initial_scroll_top={viewer_state.scroll_top}
        on_scroll_change={handle_scroll_change}
      />
    {:else}
      <HtmlViewer
        content={current_content}
        theme={stores.ui.active_theme.color_scheme}
        initial_scroll_top={viewer_state.scroll_top}
        on_scroll_change={handle_scroll_change}
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
    {@const error_msg = viewer_state.error_message ?? "Failed to load document"}
    {#if error_msg.startsWith("file_too_large:")}
      {@const size_bytes = Number(error_msg.split(":")[1])}
      <div class="DocumentViewer__state DocumentViewer__state--large-file">
        <span
          >This file is {format_bytes(size_bytes)} — exceeds the 5 MB display limit.</span
        >
        <button
          type="button"
          class="DocumentViewer__load-btn"
          onclick={() =>
            services.document.force_load_content(viewer_state.tab_id)}
        >
          Load anyway
        </button>
      </div>
    {:else}
      <div class="DocumentViewer__state DocumentViewer__state--error">
        <span>{error_msg}</span>
      </div>
    {/if}
  {:else}
    <div class="DocumentViewer__state">
      <span>Loading…</span>
    </div>
  {/if}
</div>

<TrustedHtmlDialog />

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

  .DocumentViewer__mode-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-0-5, 2px);
    padding: 2px;
    background-color: var(--muted);
    border-radius: var(--radius-sm);
  }

  .DocumentViewer__mode-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    font-weight: 500;
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    background-color: transparent;
    transition:
      background-color var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default);
  }

  .DocumentViewer__mode-btn:hover {
    color: var(--foreground);
  }

  .DocumentViewer__mode-btn--active {
    background-color: var(--background);
    color: var(--foreground);
  }

  :global(.DocumentViewer__mode-btn svg) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  .DocumentViewer__provenance {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    background-color: var(--muted);
    border-bottom: 1px solid var(--border);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .DocumentViewer__provenance-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .DocumentViewer__provenance-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-0-5, 2px);
    border-radius: var(--radius-sm);
    color: var(--muted-foreground);
    background-color: transparent;
    transition: color var(--duration-fast) var(--ease-default);
  }

  .DocumentViewer__provenance-clear:hover {
    color: var(--foreground);
  }

  :global(.DocumentViewer__provenance-clear svg) {
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

  .DocumentViewer__state--large-file {
    flex-direction: column;
    gap: var(--space-3);
    color: var(--muted-foreground);
  }

  .DocumentViewer__load-btn {
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
    font-weight: 500;
    border-radius: var(--radius-md);
    background-color: var(--secondary);
    color: var(--secondary-foreground);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .DocumentViewer__load-btn:hover {
    background-color: var(--secondary-hover, var(--muted));
  }
</style>
