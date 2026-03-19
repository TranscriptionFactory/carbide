<script lang="ts">
  import { onMount, untrack } from "svelte";
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
  import type {
    DocumentPdfZoomMode,
    DocumentPdfScrollMode,
  } from "$lib/shared/types/editor_settings";

  interface Props {
    src: string;
    initial_page: number;
    default_zoom: DocumentPdfZoomMode;
    scroll_mode: DocumentPdfScrollMode;
  }

  let { src, initial_page, default_zoom, scroll_mode }: Props = $props();

  type PDFDocumentProxy = PDFJSType.PDFDocumentProxy;
  type PDFJSModule = typeof import("pdfjs-dist");

  type PageInfo = { width: number; height: number };

  const is_continuous = $derived(scroll_mode === "continuous");

  let scroll_container_el: HTMLDivElement | undefined = $state();
  let pages_container_el: HTMLDivElement | undefined = $state();
  let search_input_el: HTMLInputElement | undefined = $state();

  let paginated_canvas_el: HTMLCanvasElement | undefined = $state();
  let paginated_text_layer_el: HTMLDivElement | undefined = $state();
  let paginated_rendering = false;

  let pdf_doc: PDFDocumentProxy | null = $state(null);
  let pdfjs_module = $state<PDFJSModule | null>(null);
  let current_page = $state(1);
  let num_pages = $state(0);
  let zoom_level = $state(1.0);
  let loading = $state(true);
  let error_msg = $state<string | null>(null);
  let page_input_value = $state("1");
  let page_infos: PageInfo[] = $state([]);

  let page_elements: Map<number, HTMLDivElement> = new Map();
  let page_canvases: Map<number, HTMLCanvasElement> = new Map();
  let page_text_layers: Map<number, HTMLDivElement> = new Map();
  let rendered_pages: Set<number> = new Set();
  let rendering_pages: Set<number> = new Set();

  let observer: IntersectionObserver | null = null;

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

  let applied_initial_zoom = false;
  let scroll_ticking = false;

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 4.0;
  const ZOOM_STEP = 0.25;

  async function load_pdf(url: string) {
    loading = true;
    error_msg = null;
    pdf_doc = null;
    num_pages = 0;
    current_page = Math.max(1, initial_page);
    page_input_value = String(current_page);
    pages_text_by_page = new Map();
    search_state = { query: "", matches: [], current_index: 0 };
    search_generation += 1;
    applied_initial_zoom = false;
    page_infos = [];
    page_elements = new Map();
    page_canvases = new Map();
    page_text_layers = new Map();
    rendered_pages = new Set();
    rendering_pages = new Set();

    if (observer) {
      observer.disconnect();
      observer = null;
    }

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

      const infos: PageInfo[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1.0 });
        infos.push({ width: vp.width, height: vp.height });
      }
      page_infos = infos;
      loading = false;
    } catch (err) {
      loading = false;
      error_msg = err instanceof Error ? err.message : "Failed to load PDF";
    }
  }

  async function render_single_page(page_num: number) {
    if (!pdf_doc || rendering_pages.has(page_num)) return;

    const canvas = page_canvases.get(page_num);
    const text_layer_div = page_text_layers.get(page_num);
    if (!canvas) return;

    rendering_pages.add(page_num);
    try {
      const pdfjs = pdfjs_module ?? (await import("pdfjs-dist"));
      pdfjs_module = pdfjs;
      const page = await pdf_doc.getPage(page_num);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: zoom_level * dpr });
      const css_viewport = page.getViewport({ scale: zoom_level });

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${css_viewport.width}px`;
      canvas.style.height = `${css_viewport.height}px`;

      await page.render({ canvasContext: ctx, viewport }).promise;

      if (text_layer_div) {
        text_layer_div.innerHTML = "";
        text_layer_div.style.width = `${css_viewport.width}px`;
        text_layer_div.style.height = `${css_viewport.height}px`;

        const tl = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: text_layer_div,
          viewport: css_viewport,
        });

        await tl.render();
        apply_highlights_to_page(page_num, text_layer_div);
      }

      rendered_pages.add(page_num);
    } finally {
      rendering_pages.delete(page_num);
    }
  }

  function clear_page(page_num: number) {
    const canvas = page_canvases.get(page_num);
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }
    const text_layer_div = page_text_layers.get(page_num);
    if (text_layer_div) text_layer_div.innerHTML = "";
    rendered_pages.delete(page_num);
  }

  function setup_observer() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (!scroll_container_el) return;

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page_num = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) {
            void render_single_page(page_num);
          } else {
            clear_page(page_num);
          }
        }
      },
      { root: scroll_container_el, rootMargin: "200%" },
    );

    for (const [, el] of page_elements) {
      observer.observe(el);
    }
  }

  function update_current_page_from_scroll() {
    if (!scroll_container_el || page_infos.length === 0) return;

    const container_mid =
      scroll_container_el.scrollTop + scroll_container_el.clientHeight / 2;

    let best_page = 1;
    let best_distance = Infinity;

    for (const [page_num, el] of page_elements) {
      const el_mid = el.offsetTop + el.offsetHeight / 2;
      const distance = Math.abs(el_mid - container_mid);
      if (distance < best_distance) {
        best_distance = distance;
        best_page = page_num;
      }
    }

    if (best_page !== current_page) {
      current_page = best_page;
      page_input_value = String(best_page);
    }
  }

  function handle_scroll() {
    if (scroll_ticking) return;
    scroll_ticking = true;
    requestAnimationFrame(() => {
      update_current_page_from_scroll();
      scroll_ticking = false;
    });
  }

  function scroll_to_page(page_num: number) {
    const el = page_elements.get(page_num);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function render_paginated_page(page_num: number) {
    if (!pdf_doc || !paginated_canvas_el || paginated_rendering) return;

    paginated_rendering = true;
    try {
      const pdfjs = pdfjs_module ?? (await import("pdfjs-dist"));
      pdfjs_module = pdfjs;
      const page = await pdf_doc.getPage(page_num);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: zoom_level * dpr });
      const css_viewport = page.getViewport({ scale: zoom_level });

      const ctx = paginated_canvas_el.getContext("2d");
      if (!ctx) return;

      paginated_canvas_el.width = viewport.width;
      paginated_canvas_el.height = viewport.height;
      paginated_canvas_el.style.width = `${css_viewport.width}px`;
      paginated_canvas_el.style.height = `${css_viewport.height}px`;

      await page.render({ canvasContext: ctx, viewport }).promise;

      if (paginated_text_layer_el) {
        paginated_text_layer_el.innerHTML = "";
        paginated_text_layer_el.style.width = `${css_viewport.width}px`;
        paginated_text_layer_el.style.height = `${css_viewport.height}px`;

        const tl = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: paginated_text_layer_el,
          viewport: css_viewport,
        });

        await tl.render();
        apply_highlights_to_page(page_num, paginated_text_layer_el);
      }
    } finally {
      paginated_rendering = false;
    }
  }

  function go_to_page(page_num: number) {
    const clamped = Math.max(1, Math.min(num_pages, page_num));
    if (clamped === current_page && !is_continuous) return;
    current_page = clamped;
    page_input_value = String(clamped);
    if (is_continuous) {
      scroll_to_page(clamped);
    } else {
      void render_paginated_page(clamped);
    }
  }

  function prev_page() {
    go_to_page(current_page - 1);
  }

  function next_page() {
    go_to_page(current_page + 1);
  }

  async function apply_zoom(new_zoom: number) {
    zoom_level = new_zoom;

    if (is_continuous) {
      if (!scroll_container_el) return;
      const target_page_el = page_elements.get(current_page);
      const scroll_ratio = target_page_el
        ? (scroll_container_el.scrollTop - target_page_el.offsetTop) /
          Math.max(1, target_page_el.offsetHeight)
        : 0;

      const pages_to_rerender = Array.from(rendered_pages);
      rendered_pages = new Set();

      await Promise.all(pages_to_rerender.map((p) => render_single_page(p)));

      if (target_page_el) {
        scroll_container_el.scrollTop =
          target_page_el.offsetTop + scroll_ratio * target_page_el.offsetHeight;
      }
    } else {
      void render_paginated_page(current_page);
    }
  }

  function zoom_in() {
    void apply_zoom(Math.min(MAX_ZOOM, zoom_level + ZOOM_STEP));
  }

  function zoom_out() {
    void apply_zoom(Math.max(MIN_ZOOM, zoom_level - ZOOM_STEP));
  }

  async function fit_width() {
    if (!pdf_doc || page_infos.length === 0) return;
    const info = page_infos[0];
    if (!info) return;
    const container = is_continuous
      ? scroll_container_el
      : paginated_canvas_el?.closest(".PdfViewer__scroll-container");
    if (!container) return;
    const new_zoom = ((container as HTMLElement).clientWidth - 32) / info.width;
    void apply_zoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, new_zoom)));
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

  async function ensure_page_text(page_num: number): Promise<PageText | null> {
    const cached = pages_text_by_page.get(page_num);
    if (cached) return cached;
    if (!pdf_doc) return null;

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
      apply_highlights_all();
      return;
    }

    const generation = ++search_generation;
    text_loading = true;
    const results: PageText[] = [];

    for (let i = 1; i <= pdf_doc.numPages; i++) {
      const page_text = await ensure_page_text(i);
      if (generation !== search_generation) return;
      if (page_text) results.push(page_text);
    }

    if (generation !== search_generation) return;

    text_loading = false;
    search_state = make_search_state(results, query);
    navigate_to_current_match();
  }

  function apply_highlights_to_page(
    page_num: number,
    text_layer_div: HTMLDivElement,
  ) {
    const spans = text_layer_div.querySelectorAll("span");
    spans.forEach((span) => {
      span.classList.remove(
        "PdfViewer__highlight",
        "PdfViewer__highlight--current",
      );
    });

    if (!search_query || search_state.matches.length === 0) return;
    if (!pages_text_by_page.has(page_num)) return;

    let char_count = 0;
    spans.forEach((span) => {
      const span_text = span.textContent ?? "";
      const span_start = char_count;
      const span_end = char_count + span_text.length;

      search_state.matches.forEach(
        ({ page_num: m_page, text_offset, length }, global_idx) => {
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

  function apply_highlights_all() {
    if (is_continuous) {
      for (const [page_num, text_layer_div] of page_text_layers) {
        if (rendered_pages.has(page_num)) {
          apply_highlights_to_page(page_num, text_layer_div);
        }
      }
    } else if (paginated_text_layer_el) {
      apply_highlights_to_page(current_page, paginated_text_layer_el);
    }
  }

  function navigate_to_current_match() {
    if (search_state.matches.length === 0) {
      apply_highlights_all();
      return;
    }

    const match = search_state.matches[search_state.current_index];
    if (!match) return;

    if (is_continuous) {
      const target_el = page_elements.get(match.page_num);
      if (target_el) {
        target_el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      apply_highlights_all();
    } else {
      if (match.page_num !== current_page) {
        current_page = match.page_num;
        page_input_value = String(match.page_num);
        void render_paginated_page(match.page_num).then(() =>
          apply_highlights_all(),
        );
      } else {
        apply_highlights_all();
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
    apply_highlights_all();
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

  function handle_viewer_keydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "f") {
      e.preventDefault();
      open_search();
    }
  }

  function register_page_wrapper(el: HTMLDivElement, page_num: number) {
    page_elements.set(page_num, el);
    el.dataset.page = String(page_num);
    if (observer) observer.observe(el);
    return {
      destroy() {
        page_elements.delete(page_num);
        if (observer) observer.unobserve(el);
      },
    };
  }

  function register_canvas(el: HTMLCanvasElement, page_num: number) {
    page_canvases.set(page_num, el);
    return {
      destroy() {
        page_canvases.delete(page_num);
      },
    };
  }

  function register_text_layer(el: HTMLDivElement, page_num: number) {
    page_text_layers.set(page_num, el);
    return {
      destroy() {
        page_text_layers.delete(page_num);
      },
    };
  }

  $effect(() => {
    const url = src;
    if (url) untrack(() => void load_pdf(url));
  });

  $effect(() => {
    if (loading || !pdf_doc || page_infos.length === 0) return;

    if (is_continuous && !pages_container_el) return;
    if (!is_continuous && !paginated_canvas_el) return;

    if (!applied_initial_zoom) {
      applied_initial_zoom = true;
      if (is_continuous) {
        if (default_zoom === "fit_width") {
          untrack(
            () =>
              void fit_width().then(() => {
                setup_observer();
                const target = Math.max(1, initial_page);
                setTimeout(() => scroll_to_page(target), 50);
              }),
          );
        } else {
          untrack(() => {
            setup_observer();
            const target = Math.max(1, initial_page);
            setTimeout(() => scroll_to_page(target), 50);
          });
        }
      } else {
        if (default_zoom === "fit_width") {
          untrack(() => void fit_width());
        } else {
          untrack(() => void render_paginated_page(current_page));
        }
      }
    }
  });

  onMount(() => {
    return () => {
      observer?.disconnect();
      pdf_doc?.destroy();
    };
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
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

  <div
    bind:this={scroll_container_el}
    class="PdfViewer__scroll-container"
    onscroll={is_continuous ? handle_scroll : undefined}
  >
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
    {:else if is_continuous}
      <div bind:this={pages_container_el} class="PdfViewer__pages-container">
        {#each page_infos as info, idx}
          {@const page_num = idx + 1}
          {@const css_width = info.width * zoom_level}
          {@const css_height = info.height * zoom_level}
          <div
            class="PdfViewer__page-wrapper"
            style="width: {css_width}px; height: {css_height}px;"
            use:register_page_wrapper={page_num}
          >
            <canvas class="PdfViewer__canvas" use:register_canvas={page_num}
            ></canvas>
            <div
              class="PdfViewer__text-layer"
              aria-hidden="true"
              use:register_text_layer={page_num}
            ></div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="PdfViewer__page-wrapper">
        <canvas bind:this={paginated_canvas_el} class="PdfViewer__canvas"
        ></canvas>
        <div
          bind:this={paginated_text_layer_el}
          class="PdfViewer__text-layer"
          aria-hidden="true"
        ></div>
      </div>
    {/if}
  </div>
</div>

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

  .PdfViewer__scroll-container {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-4);
    background-color: var(--muted);
    position: relative;
  }

  .PdfViewer__pages-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .PdfViewer__page-wrapper {
    position: relative;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-md);
    line-height: 1;
    background-color: white;
    flex-shrink: 0;
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
  }

  .PdfViewer__text-layer :global(span) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
  }

  .PdfViewer__text-layer :global(span::selection) {
    background-color: color-mix(in srgb, var(--ring) 40%, transparent);
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
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background-color: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    align-self: flex-end;
    margin-bottom: var(--space-2);
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
