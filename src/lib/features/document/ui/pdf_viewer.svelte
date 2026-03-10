<script lang="ts">
  import { onMount } from "svelte";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ZoomInIcon from "@lucide/svelte/icons/zoom-in";
  import ZoomOutIcon from "@lucide/svelte/icons/zoom-out";
  import MaximizeIcon from "@lucide/svelte/icons/maximize";
  import SearchIcon from "@lucide/svelte/icons/search";
  import XIcon from "@lucide/svelte/icons/x";
  import type * as PDFJSType from "pdfjs-dist";
  import {
    navigate_match,
    make_search_state,
  } from "$lib/features/document/domain/pdf_search";
  import type {
    PageText,
    SearchState,
  } from "$lib/features/document/domain/pdf_search";
  import type { DocumentPdfZoomMode } from "$lib/shared/types/editor_settings";

  interface Props {
    src: string;
    default_zoom: DocumentPdfZoomMode;
  }

  let { src, default_zoom }: Props = $props();

  type PDFDocumentProxy = PDFJSType.PDFDocumentProxy;
  type PDFJSModule = typeof import("pdfjs-dist");

  let canvas_el: HTMLCanvasElement | undefined = $state();
  let text_layer_el: HTMLDivElement | undefined = $state();
  let search_input_el: HTMLInputElement | undefined = $state();

  let pdf_doc: PDFDocumentProxy | null = $state(null);
  let pdfjs_module = $state<PDFJSModule | null>(null);
  let current_page = $state(1);
  let num_pages = $state(0);
  let zoom_level = $state(1.0);
  let loading = $state(true);
  let error_msg = $state<string | null>(null);
  let page_input_value = $state("1");
  let rendering = $state(false);

  let search_open = $state(false);
  let search_query = $state("");
  let pages_text_by_page = $state<Map<number, PageText>>(new Map());
  let search_state = $state<SearchState>({
    query: "",
    matches: [],
    current_index: 0,
  });
  let text_loading = $state(false);
  let search_generation = $state(0);
  let applied_initial_zoom = $state(false);

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 4.0;
  const ZOOM_STEP = 0.25;

  async function load_pdf(url: string) {
    loading = true;
    error_msg = null;
    pdf_doc = null;
    num_pages = 0;
    current_page = 1;
    page_input_value = "1";
    pages_text_by_page = new Map();
    search_state = { query: "", matches: [], current_index: 0 };
    search_generation += 1;
    applied_initial_zoom = false;

    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs_module = pdfjs;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch PDF (${resp.status})`);
      const data = new Uint8Array(await resp.arrayBuffer());
      const doc = await pdfjs.getDocument({ data }).promise;
      pdf_doc = doc;
      num_pages = doc.numPages;
      loading = false;
      await render_page(current_page);
    } catch (err) {
      loading = false;
      error_msg = err instanceof Error ? err.message : "Failed to load PDF";
    }
  }

  async function ensure_page_text(page_num: number): Promise<PageText | null> {
    const cached = pages_text_by_page.get(page_num);
    if (cached) {
      return cached;
    }
    if (!pdf_doc) {
      return null;
    }

    const page = await pdf_doc.getPage(page_num);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    const page_text = { page_num, text };
    pages_text_by_page = new Map(pages_text_by_page).set(page_num, page_text);
    return page_text;
  }

  async function run_search(query: string) {
    if (!pdf_doc || !query) {
      text_loading = false;
      search_state = { query, matches: [], current_index: 0 };
      apply_highlights(current_page);
      return;
    }

    const generation = ++search_generation;
    text_loading = true;
    const results: PageText[] = [];

    for (let i = 1; i <= pdf_doc.numPages; i++) {
      const page_text = await ensure_page_text(i);
      if (generation !== search_generation) {
        return;
      }
      if (page_text) {
        results.push(page_text);
      }
    }

    if (generation !== search_generation) {
      return;
    }

    text_loading = false;
    search_state = make_search_state(results, query);
    navigate_to_current_match();
  }

  async function render_page(page_num: number) {
    if (!pdf_doc || !canvas_el || rendering) return;

    rendering = true;
    try {
      const pdfjs = pdfjs_module ?? (await import("pdfjs-dist"));
      pdfjs_module = pdfjs;
      const page = await pdf_doc.getPage(page_num);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: zoom_level * dpr });
      const css_viewport = page.getViewport({ scale: zoom_level });

      const ctx = canvas_el.getContext("2d");
      if (!ctx) return;

      canvas_el.width = viewport.width;
      canvas_el.height = viewport.height;
      canvas_el.style.width = `${css_viewport.width}px`;
      canvas_el.style.height = `${css_viewport.height}px`;

      await page.render({ canvasContext: ctx, viewport }).promise;

      if (text_layer_el) {
        text_layer_el.innerHTML = "";
        text_layer_el.style.width = `${css_viewport.width}px`;
        text_layer_el.style.height = `${css_viewport.height}px`;

        const text_layer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: text_layer_el,
          viewport: css_viewport,
        });

        await text_layer.render();
        apply_highlights(page_num);
      }
    } finally {
      rendering = false;
    }
  }

  function apply_highlights(page_num: number) {
    if (!text_layer_el) return;

    const spans = text_layer_el.querySelectorAll("span");
    spans.forEach((span) => {
      span.classList.remove(
        "PdfViewer__highlight",
        "PdfViewer__highlight--current",
      );
    });

    if (!search_query || search_state.matches.length === 0) return;

    const page_matches = search_state.matches.map((m, idx) => ({
      ...m,
      global_idx: idx,
    }));

    if (!pages_text_by_page.has(page_num)) return;

    let char_count = 0;
    spans.forEach((span) => {
      const span_text = span.textContent ?? "";
      const span_start = char_count;
      const span_end = char_count + span_text.length;

      page_matches.forEach(
        ({ page_num: m_page, text_offset, length, global_idx }) => {
          if (m_page !== page_num) return;
          const match_end = text_offset + length;

          if (text_offset < span_end && match_end > span_start) {
            if (global_idx === search_state.current_index) {
              span.classList.add("PdfViewer__highlight--current");
            } else {
              span.classList.add("PdfViewer__highlight");
            }
          }
        },
      );

      char_count += span_text.length + 1;
    });
  }

  function go_to_page(page_num: number) {
    const clamped = Math.max(1, Math.min(num_pages, page_num));
    if (clamped === current_page) return;
    current_page = clamped;
    page_input_value = String(clamped);
    void render_page(clamped);
  }

  function prev_page() {
    go_to_page(current_page - 1);
  }

  function next_page() {
    go_to_page(current_page + 1);
  }

  function zoom_in() {
    zoom_level = Math.min(MAX_ZOOM, zoom_level + ZOOM_STEP);
    void render_page(current_page);
  }

  function zoom_out() {
    zoom_level = Math.max(MIN_ZOOM, zoom_level - ZOOM_STEP);
    void render_page(current_page);
  }

  async function fit_width() {
    if (!pdf_doc || !canvas_el) return;
    const container = canvas_el.parentElement;
    if (!container) return;
    const page = await pdf_doc.getPage(current_page);
    const viewport = page.getViewport({ scale: 1.0 });
    zoom_level = container.clientWidth / viewport.width;
    void render_page(current_page);
  }

  function handle_page_input_change(e: Event) {
    page_input_value = (e.target as HTMLInputElement).value;
  }

  function handle_page_input_commit() {
    const parsed = parseInt(page_input_value, 10);
    if (!isNaN(parsed)) {
      go_to_page(parsed);
    } else {
      page_input_value = String(current_page);
    }
  }

  function handle_page_input_keydown(e: KeyboardEvent) {
    if (e.key === "Enter") handle_page_input_commit();
  }

  function open_search() {
    search_open = true;
    setTimeout(() => search_input_el?.focus(), 0);
  }

  function close_search() {
    search_generation += 1;
    search_open = false;
    search_query = "";
    search_state = { query: "", matches: [], current_index: 0 };
    text_loading = false;
    apply_highlights(current_page);
  }

  function handle_search_input(e: Event) {
    search_query = (e.target as HTMLInputElement).value;
    void run_search(search_query);
  }

  function handle_search_keydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      close_search();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        search_prev();
      } else {
        search_next();
      }
    }
  }

  function search_next() {
    search_state = navigate_match(search_state, "next");
    navigate_to_current_match();
  }

  function search_prev() {
    search_state = navigate_match(search_state, "prev");
    navigate_to_current_match();
  }

  function navigate_to_current_match() {
    if (search_state.matches.length === 0) {
      apply_highlights(current_page);
      return;
    }

    const match = search_state.matches[search_state.current_index];
    if (!match) return;
    if (match.page_num !== current_page) {
      current_page = match.page_num;
      page_input_value = String(match.page_num);
      void render_page(match.page_num).then(() =>
        apply_highlights(match.page_num),
      );
    } else {
      apply_highlights(current_page);
    }
  }

  function handle_viewer_keydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "f") {
      e.preventDefault();
      open_search();
    }
  }

  $effect(() => {
    if (src) void load_pdf(src);
  });

  $effect(() => {
    if (!loading && pdf_doc && canvas_el) {
      void render_page(current_page);
    }
  });

  $effect(() => {
    if (loading || !pdf_doc || !canvas_el || applied_initial_zoom) return;
    applied_initial_zoom = true;
    if (default_zoom === "fit_width") {
      void fit_width();
      return;
    }
    zoom_level = 1.0;
  });

  onMount(() => {
    return () => {
      pdf_doc?.destroy();
    };
  });
</script>

<div
  class="PdfViewer"
  onkeydown={handle_viewer_keydown}
  tabindex="-1"
  role="region"
  aria-label="PDF viewer"
>
  <div class="PdfViewer__toolbar">
    <div class="PdfViewer__toolbar-group">
      <button
        class="PdfViewer__toolbar-btn"
        onclick={prev_page}
        disabled={current_page <= 1 || loading}
        aria-label="Previous page"
      >
        <ChevronLeftIcon size={16} />
      </button>
      <div class="PdfViewer__page-nav">
        <input
          class="PdfViewer__page-input"
          type="text"
          value={page_input_value}
          onchange={handle_page_input_change}
          onblur={handle_page_input_commit}
          onkeydown={handle_page_input_keydown}
          disabled={loading}
          aria-label="Current page"
        />
        <span class="PdfViewer__page-sep">/</span>
        <span class="PdfViewer__page-total">{num_pages}</span>
      </div>
      <button
        class="PdfViewer__toolbar-btn"
        onclick={next_page}
        disabled={current_page >= num_pages || loading}
        aria-label="Next page"
      >
        <ChevronRightIcon size={16} />
      </button>
    </div>

    <div class="PdfViewer__toolbar-group">
      <button
        class="PdfViewer__toolbar-btn"
        onclick={zoom_out}
        disabled={zoom_level <= MIN_ZOOM || loading}
        aria-label="Zoom out"
      >
        <ZoomOutIcon size={16} />
      </button>
      <span class="PdfViewer__zoom-label">{Math.round(zoom_level * 100)}%</span>
      <button
        class="PdfViewer__toolbar-btn"
        onclick={zoom_in}
        disabled={zoom_level >= MAX_ZOOM || loading}
        aria-label="Zoom in"
      >
        <ZoomInIcon size={16} />
      </button>
      <button
        class="PdfViewer__toolbar-btn"
        onclick={fit_width}
        disabled={loading}
        aria-label="Fit to width"
      >
        <MaximizeIcon size={16} />
      </button>
      <button
        class="PdfViewer__toolbar-btn"
        onclick={open_search}
        disabled={loading}
        aria-label="Search text"
      >
        <SearchIcon size={16} />
      </button>
    </div>
  </div>

  <div class="PdfViewer__canvas-container">
    {#if search_open}
      <div class="PdfViewer__search-bar" role="search">
        <SearchIcon size={14} class="PdfViewer__search-icon" />
        <input
          bind:this={search_input_el}
          class="PdfViewer__search-input"
          type="text"
          placeholder="Find in document…"
          value={search_query}
          oninput={handle_search_input}
          onkeydown={handle_search_keydown}
          aria-label="Search"
        />
        {#if search_query}
          <span class="PdfViewer__search-count">
            {#if text_loading}
              …
            {:else if search_state.matches.length === 0}
              No results
            {:else}
              {search_state.current_index + 1} of {search_state.matches.length}
            {/if}
          </span>
        {/if}
        <button
          class="PdfViewer__search-nav-btn"
          onclick={search_prev}
          disabled={search_state.matches.length === 0}
          aria-label="Previous match"
        >
          <ChevronLeftIcon size={14} />
        </button>
        <button
          class="PdfViewer__search-nav-btn"
          onclick={search_next}
          disabled={search_state.matches.length === 0}
          aria-label="Next match"
        >
          <ChevronRightIcon size={14} />
        </button>
        <button
          class="PdfViewer__search-close-btn"
          onclick={close_search}
          aria-label="Close search"
        >
          <XIcon size={14} />
        </button>
      </div>
    {/if}

    {#if loading}
      <div class="PdfViewer__state">
        <span class="PdfViewer__state-text">Loading PDF…</span>
      </div>
    {:else if error_msg}
      <div class="PdfViewer__state PdfViewer__state--error">
        <span class="PdfViewer__state-text">{error_msg}</span>
      </div>
    {:else}
      <div class="PdfViewer__page-wrapper">
        <canvas bind:this={canvas_el} class="PdfViewer__canvas"></canvas>
        <div
          bind:this={text_layer_el}
          class="PdfViewer__text-layer"
          aria-hidden="true"
        ></div>
      </div>
    {/if}
  </div>
</div>
let search_generation = 0;

<style>
  .PdfViewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background);
    color: var(--foreground);
    outline: none;
  }

  .PdfViewer__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    background-color: var(--muted);
    flex-shrink: 0;
    gap: var(--space-4);
  }

  .PdfViewer__toolbar-group {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .PdfViewer__toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-7);
    height: var(--space-7);
    border-radius: var(--radius-md);
    border: none;
    background: transparent;
    color: var(--foreground);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .PdfViewer__toolbar-btn:hover:not(:disabled) {
    background-color: var(--accent);
  }

  .PdfViewer__toolbar-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .PdfViewer__page-nav {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }

  .PdfViewer__page-input {
    width: calc(var(--space-6) * 2);
    text-align: center;
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background-color: var(--background);
    color: var(--foreground);
  }

  .PdfViewer__page-input:disabled {
    opacity: 0.5;
  }

  .PdfViewer__page-sep {
    color: var(--muted-foreground);
  }

  .PdfViewer__page-total {
    color: var(--muted-foreground);
    min-width: var(--space-5);
  }

  .PdfViewer__zoom-label {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    min-width: calc(var(--space-6) + var(--space-3));
    text-align: center;
  }

  .PdfViewer__canvas-container {
    flex: 1;
    overflow: auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: var(--space-4);
    background-color: var(--muted);
    position: relative;
  }

  .PdfViewer__page-wrapper {
    position: relative;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-md);
    line-height: 1;
  }

  .PdfViewer__canvas {
    display: block;
    border-radius: var(--radius-md);
  }

  .PdfViewer__text-layer {
    position: absolute;
    top: 0;
    left: 0;
    overflow: hidden;
    border-radius: var(--radius-md);
    pointer-events: none;
  }

  .PdfViewer__text-layer :global(span) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
    pointer-events: auto;
  }

  .PdfViewer__text-layer :global(br) {
    display: none;
  }

  .PdfViewer__text-layer :global(.PdfViewer__highlight) {
    background-color: color-mix(in srgb, var(--ring) 35%, transparent);
    border-radius: 2px;
  }

  .PdfViewer__text-layer :global(.PdfViewer__highlight--current) {
    background-color: color-mix(in srgb, var(--ring) 70%, transparent);
    border-radius: 2px;
    outline: 1px solid var(--ring);
  }

  .PdfViewer__state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    min-height: 200px;
  }

  .PdfViewer__state-text {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .PdfViewer__state--error .PdfViewer__state-text {
    color: var(--destructive);
  }

  .PdfViewer__search-bar {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background-color: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .PdfViewer__search-input {
    font-size: var(--text-sm);
    border: none;
    outline: none;
    background: transparent;
    color: var(--foreground);
    width: 180px;
    padding: var(--space-1) 0;
  }

  .PdfViewer__search-input::placeholder {
    color: var(--muted-foreground);
  }

  .PdfViewer__search-count {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    white-space: nowrap;
    padding: 0 var(--space-1);
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
  }

  .PdfViewer__search-nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-6);
    height: var(--space-6);
    border: none;
    background: transparent;
    color: var(--foreground);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background-color 0.15s ease;
  }

  .PdfViewer__search-nav-btn:hover:not(:disabled) {
    background-color: var(--accent);
  }

  .PdfViewer__search-nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .PdfViewer__search-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-6);
    height: var(--space-6);
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background-color 0.15s ease;
  }

  .PdfViewer__search-close-btn:hover {
    background-color: var(--accent);
    color: var(--foreground);
  }
</style>
