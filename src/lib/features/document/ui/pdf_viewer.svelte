<script lang="ts">
  import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

  type Props = {
    src: string;
  };

  const { src }: Props = $props();

  let canvas_el: HTMLCanvasElement | undefined = $state();
  let container_el: HTMLDivElement | undefined = $state();

  let pdf: PDFDocumentProxy | undefined = $state();
  let current_page = $state(1);
  let total_pages = $state(0);
  let zoom = $state(1.0);
  let fit_width = $state(false);
  let fit_page = $state(false);
  let loading = $state(true);
  let error: string | undefined = $state();
  let page_input = $state("1");

  let active_render: RenderTask | null = null;

  async function load_pdf() {
    loading = true;
    error = undefined;
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();
      pdf = await pdfjs.getDocument(src).promise;
      total_pages = pdf.numPages;
      current_page = 1;
      page_input = "1";
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load PDF";
    } finally {
      loading = false;
    }
  }

  async function render_page(page_num: number) {
    if (!pdf || !canvas_el) return;

    if (active_render) {
      active_render.cancel();
      active_render = null;
    }

    const page: PDFPageProxy = await pdf.getPage(page_num);
    const dpr = window.devicePixelRatio || 1;

    let scale = zoom;
    if ((fit_width || fit_page) && container_el) {
      const { width: base_w, height: base_h } = page.getViewport({ scale: 1 });
      const scale_w = container_el.clientWidth / base_w;
      if (fit_width) {
        scale = scale_w;
      } else {
        scale = Math.min(scale_w, container_el.clientHeight / base_h);
      }
    }

    const viewport = page.getViewport({ scale });
    const ctx = canvas_el.getContext("2d")!;

    canvas_el.width = Math.floor(viewport.width * dpr);
    canvas_el.height = Math.floor(viewport.height * dpr);
    canvas_el.style.width = `${Math.floor(viewport.width)}px`;
    canvas_el.style.height = `${Math.floor(viewport.height)}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    active_render = page.render({ canvasContext: ctx, viewport });
    try {
      await active_render.promise;
    } catch {
    } finally {
      active_render = null;
    }
  }

  function go_prev() {
    if (current_page > 1) {
      current_page -= 1;
      page_input = String(current_page);
    }
  }

  function go_next() {
    if (current_page < total_pages) {
      current_page += 1;
      page_input = String(current_page);
    }
  }

  function on_page_input_change() {
    const n = parseInt(page_input, 10);
    if (!isNaN(n) && n >= 1 && n <= total_pages) {
      current_page = n;
    } else {
      page_input = String(current_page);
    }
  }

  function zoom_in() {
    fit_width = false;
    fit_page = false;
    zoom = Math.min(zoom + 0.25, 4.0);
  }

  function zoom_out() {
    fit_width = false;
    fit_page = false;
    zoom = Math.max(zoom - 0.25, 0.25);
  }

  function toggle_fit_width() {
    fit_page = false;
    fit_width = !fit_width;
  }

  function toggle_fit_page() {
    fit_width = false;
    fit_page = !fit_page;
  }

  $effect(() => {
    void load_pdf();
    return () => {
      pdf?.destroy();
    };
  });

  $effect(() => {
    if (!loading && pdf && canvas_el) {
      void render_page(current_page);
    }
  });
</script>

<div class="PdfViewer">
  {#if loading}
    <div class="PdfViewer__loading">
      <span class="PdfViewer__loading-text">Loading PDF…</span>
    </div>
  {:else if error}
    <div class="PdfViewer__error">
      <p class="PdfViewer__error-text">{error}</p>
    </div>
  {:else}
    <div class="PdfViewer__toolbar">
      <div class="PdfViewer__toolbar-nav">
        <button
          class="PdfViewer__btn"
          disabled={current_page <= 1}
          onclick={go_prev}
          aria-label="Previous page"
        >
          ‹
        </button>
        <input
          class="PdfViewer__page-input"
          type="number"
          min="1"
          max={total_pages}
          bind:value={page_input}
          onchange={on_page_input_change}
          aria-label="Current page"
        />
        <span class="PdfViewer__page-count">/ {total_pages}</span>
        <button
          class="PdfViewer__btn"
          disabled={current_page >= total_pages}
          onclick={go_next}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
      <div class="PdfViewer__toolbar-zoom">
        <button class="PdfViewer__btn" onclick={zoom_out} aria-label="Zoom out">−</button>
        <span class="PdfViewer__zoom-label">{Math.round(zoom * 100)}%</span>
        <button class="PdfViewer__btn" onclick={zoom_in} aria-label="Zoom in">+</button>
        <button
          class="PdfViewer__btn PdfViewer__btn--toggle"
          class:PdfViewer__btn--active={fit_width}
          onclick={toggle_fit_width}
          aria-label="Fit width"
          aria-pressed={fit_width}
        >
          W
        </button>
        <button
          class="PdfViewer__btn PdfViewer__btn--toggle"
          class:PdfViewer__btn--active={fit_page}
          onclick={toggle_fit_page}
          aria-label="Fit page"
          aria-pressed={fit_page}
        >
          P
        </button>
      </div>
    </div>
    <div class="PdfViewer__canvas-container" bind:this={container_el}>
      <canvas class="PdfViewer__canvas" bind:this={canvas_el}></canvas>
    </div>
  {/if}
</div>

<style>
  .PdfViewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    color: var(--foreground);
  }

  .PdfViewer__loading,
  .PdfViewer__error {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: var(--space-6);
  }

  .PdfViewer__loading-text {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .PdfViewer__error-text {
    font-size: var(--text-sm);
    color: var(--destructive);
  }

  .PdfViewer__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    background-color: var(--muted);
    gap: var(--space-4);
    flex-shrink: 0;
  }

  .PdfViewer__toolbar-nav,
  .PdfViewer__toolbar-zoom {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .PdfViewer__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background-color: var(--background);
    color: var(--foreground);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: background-color 0.1s;
  }

  .PdfViewer__btn:hover:not(:disabled) {
    background-color: var(--muted);
  }

  .PdfViewer__btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .PdfViewer__btn--active {
    background-color: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .PdfViewer__page-input {
    width: 3rem;
    height: 1.75rem;
    padding: 0 var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background-color: var(--background);
    color: var(--foreground);
    font-size: var(--text-sm);
    text-align: center;
  }

  .PdfViewer__page-count {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    white-space: nowrap;
  }

  .PdfViewer__zoom-label {
    font-size: var(--text-sm);
    color: var(--foreground);
    min-width: 3rem;
    text-align: center;
  }

  .PdfViewer__canvas-container {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: var(--space-4);
    background-color: var(--muted);
  }

  .PdfViewer__canvas {
    display: block;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    background-color: white;
  }
</style>
