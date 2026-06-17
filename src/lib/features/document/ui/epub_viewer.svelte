<script lang="ts">
  import { onMount, untrack } from "svelte";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ListIcon from "@lucide/svelte/icons/list";
  import SearchIcon from "@lucide/svelte/icons/search";
  import XIcon from "@lucide/svelte/icons/x";
  import "$lib/vendor/foliate-js/view.js";
  import type {
    FoliateView,
    FoliateTocItem,
    FoliateRelocateDetail,
    FoliateLoadResource,
    FoliateTransformData,
    FoliateSearchSubitem,
  } from "$lib/features/document/types/foliate";
  import {
    inject_csp,
    is_html_type,
  } from "$lib/features/document/domain/epub_csp";
  import { build_book_css } from "$lib/features/document/domain/epub_book_css";
  import type { Theme } from "$lib/shared/types/theme";
  import type { DocumentEpubFlow } from "$lib/shared/types/editor_settings";

  interface Props {
    src: string;
    theme: Theme;
    initial_cfi: string | null;
    on_position_change: (cfi: string) => void;
    flow: DocumentEpubFlow;
    max_column_count: number;
    max_inline_size: number;
    font_scale: number;
    line_height: number;
  }

  let {
    src,
    theme,
    initial_cfi,
    on_position_change,
    flow,
    max_column_count,
    max_inline_size,
    font_scale,
    line_height,
  }: Props = $props();

  let container_el: HTMLDivElement | undefined = $state();
  let search_input_el: HTMLInputElement | undefined = $state();

  let view = $state<FoliateView | undefined>();
  let load_revision = 0;
  let position_timer: ReturnType<typeof setTimeout> | undefined;

  let loading = $state(true);
  let error_msg = $state<string | null>(null);
  let toc = $state<FoliateTocItem[]>([]);
  let toc_open = $state(false);
  let progress_percent = $state(0);

  let search_open = $state(false);
  let search_query = $state("");
  let search_results = $state<FoliateSearchSubitem[]>([]);
  let search_index = $state(0);
  let searching = $state(false);
  let search_generation = 0;

  function harden_book(): void {
    const target = view?.book?.transformTarget;
    if (!target) return;
    target.addEventListener("data", (event) => {
      const detail = (event as CustomEvent<FoliateTransformData>).detail;
      if (!is_html_type(detail.type)) return;
      detail.data = Promise.resolve(detail.data).then((data) =>
        typeof data === "string" ? inject_csp(data) : data,
      );
    });
    target.addEventListener("load", (event) => {
      const detail = (event as CustomEvent<FoliateLoadResource>).detail;
      if (detail.isScript) detail.allow = false;
    });
  }

  function apply_theme(): void {
    view?.renderer?.setStyles?.(
      build_book_css(theme, { font_scale, line_height }),
    );
  }

  function apply_layout(): void {
    const renderer = view?.renderer;
    if (!renderer) return;
    renderer.setAttribute(
      "flow",
      flow === "scrolled" ? "scrolled" : "paginated",
    );
    renderer.setAttribute("max-column-count", String(max_column_count));
    renderer.setAttribute("max-inline-size", `${max_inline_size}px`);
  }

  function handle_relocate(detail: FoliateRelocateDetail): void {
    if (typeof detail.fraction === "number") {
      progress_percent = Math.round(detail.fraction * 100);
    }
    if (!detail.cfi) return;
    if (position_timer) clearTimeout(position_timer);
    const cfi = detail.cfi;
    position_timer = setTimeout(() => on_position_change(cfi), 1000);
  }

  async function load_book(url: string): Promise<void> {
    if (!view) return;
    const revision = ++load_revision;
    loading = true;
    error_msg = null;
    toc = [];
    toc_open = false;
    progress_percent = 0;
    close_search();

    try {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`Failed to fetch EPUB (${response.status})`);
      const blob = await response.blob();
      if (revision !== load_revision) return;

      await view.open(blob);
      if (revision !== load_revision) return;

      harden_book();
      apply_layout();
      apply_theme();
      toc = view.book?.toc ?? [];

      await view.init(initial_cfi ? { lastLocation: initial_cfi } : {});
      if (revision !== load_revision) return;
      loading = false;
    } catch (err) {
      if (revision !== load_revision) return;
      loading = false;
      error_msg = err instanceof Error ? err.message : "Failed to load EPUB";
    }
  }

  function prev_page(): void {
    void view?.prev();
  }

  function next_page(): void {
    void view?.next();
  }

  function go_to_href(href: string): void {
    void view?.goTo(href);
    toc_open = false;
  }

  function open_search(): void {
    search_open = true;
    setTimeout(() => search_input_el?.focus(), 0);
  }

  function close_search(): void {
    search_generation += 1;
    searching = false;
    search_open = false;
    search_query = "";
    search_results = [];
    search_index = 0;
    view?.clearSearch();
  }

  async function run_search(): Promise<void> {
    const active = view;
    const query = search_query.trim();
    if (!active || !query) {
      search_results = [];
      return;
    }
    const generation = ++search_generation;
    searching = true;
    search_results = [];
    search_index = 0;
    const collected: FoliateSearchSubitem[] = [];
    try {
      for await (const result of active.search({ query })) {
        if (generation !== search_generation) return;
        if (result === "done") break;
        if ("subitems" in result) {
          collected.push(...result.subitems);
          search_results = [...collected];
          if (collected.length >= 1000) break;
        }
      }
    } finally {
      if (generation === search_generation) searching = false;
    }
  }

  function navigate_to_match(index: number): void {
    const match = search_results[index];
    if (!match) return;
    search_index = index;
    void view?.goTo(match.cfi);
  }

  function search_next(): void {
    if (search_results.length === 0) return;
    navigate_to_match((search_index + 1) % search_results.length);
  }

  function search_prev(): void {
    if (search_results.length === 0) return;
    navigate_to_match(
      (search_index - 1 + search_results.length) % search_results.length,
    );
  }

  function handle_search_keydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      close_search();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (search_results.length > 0 && !searching) {
        if (e.shiftKey) search_prev();
        else search_next();
      } else {
        void run_search();
      }
    }
  }

  function handle_viewer_keydown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key === "f") {
      e.preventDefault();
      open_search();
    } else if (e.key === "ArrowLeft" && !search_open) {
      prev_page();
    } else if (e.key === "ArrowRight" && !search_open) {
      next_page();
    }
  }

  onMount(() => {
    const el = document.createElement("foliate-view") as unknown as FoliateView;
    el.style.width = "100%";
    el.style.height = "100%";
    el.addEventListener("relocate", (e) =>
      handle_relocate((e as CustomEvent<FoliateRelocateDetail>).detail),
    );
    el.addEventListener("external-link", (e) => e.preventDefault());
    container_el?.append(el);
    view = el;

    return () => {
      if (position_timer) clearTimeout(position_timer);
      load_revision++;
      view?.close();
      el.remove();
      view = undefined;
    };
  });

  $effect(() => {
    const url = src;
    const ready = view;
    if (url && ready) untrack(() => void load_book(url));
  });

  $effect(() => {
    void theme;
    void font_scale;
    void line_height;
    untrack(() => apply_theme());
  });

  $effect(() => {
    void flow;
    void max_column_count;
    void max_inline_size;
    untrack(() => apply_layout());
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="EpubViewer"
  onkeydown={handle_viewer_keydown}
  tabindex="-1"
  role="region"
  aria-label="EPUB viewer"
>
  <div class="EpubViewer__toolbar">
    <div class="EpubViewer__toolbar-group">
      <button
        class="EpubViewer__toolbar-btn"
        class:EpubViewer__toolbar-btn--active={toc_open}
        onclick={() => (toc_open = !toc_open)}
        disabled={loading || toc.length === 0}
        aria-label="Table of contents"
        title="Table of contents"
      >
        <ListIcon size={16} />
      </button>
    </div>

    <div class="EpubViewer__toolbar-group">
      <button
        class="EpubViewer__toolbar-btn"
        onclick={prev_page}
        disabled={loading}
        aria-label="Previous page"
      >
        <ChevronLeftIcon size={16} />
      </button>
      <span class="EpubViewer__progress">{progress_percent}%</span>
      <button
        class="EpubViewer__toolbar-btn"
        onclick={next_page}
        disabled={loading}
        aria-label="Next page"
      >
        <ChevronRightIcon size={16} />
      </button>
    </div>

    <div class="EpubViewer__toolbar-group">
      <button
        class="EpubViewer__toolbar-btn"
        onclick={open_search}
        disabled={loading}
        aria-label="Search in book"
        title="Search in book"
      >
        <SearchIcon size={16} />
      </button>
    </div>
  </div>

  {#if search_open}
    <div class="EpubViewer__search-bar" role="search">
      <SearchIcon size={14} class="EpubViewer__search-icon" />
      <input
        bind:this={search_input_el}
        class="EpubViewer__search-input"
        type="text"
        placeholder="Search in book…"
        bind:value={search_query}
        onkeydown={handle_search_keydown}
        aria-label="Search in book"
      />
      <span class="EpubViewer__search-count">
        {#if searching}
          searching…
        {:else if search_query && search_results.length === 0}
          No results
        {:else if search_results.length > 0}
          {search_index + 1} of {search_results.length}
        {/if}
      </span>
      <button
        class="EpubViewer__search-nav-btn"
        onclick={search_prev}
        disabled={search_results.length === 0}
        aria-label="Previous match"
      >
        <ChevronLeftIcon size={14} />
      </button>
      <button
        class="EpubViewer__search-nav-btn"
        onclick={search_next}
        disabled={search_results.length === 0}
        aria-label="Next match"
      >
        <ChevronRightIcon size={14} />
      </button>
      <button
        class="EpubViewer__search-close-btn"
        onclick={close_search}
        aria-label="Close search"
      >
        <XIcon size={14} />
      </button>
    </div>
  {/if}

  <div class="EpubViewer__body">
    {#if toc_open && toc.length > 0}
      <nav class="EpubViewer__toc" aria-label="Table of contents">
        {@render toc_list(toc)}
      </nav>
    {/if}

    <div
      class="EpubViewer__stage"
      class:EpubViewer__stage--hidden={loading || error_msg}
    >
      <div bind:this={container_el} class="EpubViewer__surface"></div>
    </div>

    {#if loading}
      <div class="EpubViewer__state">
        <span class="EpubViewer__state-text">Loading EPUB…</span>
      </div>
    {:else if error_msg}
      <div class="EpubViewer__state EpubViewer__state--error">
        <span class="EpubViewer__state-text">{error_msg}</span>
      </div>
    {/if}
  </div>
</div>

{#snippet toc_list(items: FoliateTocItem[])}
  <ul class="EpubViewer__toc-list">
    {#each items as item (item.href)}
      <li class="EpubViewer__toc-item">
        <button
          class="EpubViewer__toc-link"
          onclick={() => go_to_href(item.href)}
        >
          {item.label}
        </button>
        {#if item.subitems && item.subitems.length > 0}
          {@render toc_list(item.subitems)}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<style>
  .EpubViewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--editor-background);
    color: var(--editor-foreground);
    outline: none;
  }

  .EpubViewer__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--border);
    background-color: var(--muted);
    flex-shrink: 0;
    gap: var(--space-4);
  }

  .EpubViewer__toolbar-group {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .EpubViewer__toolbar-btn {
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

  .EpubViewer__toolbar-btn:hover:not(:disabled) {
    background-color: var(--accent);
  }

  .EpubViewer__toolbar-btn--active {
    background-color: var(--accent);
  }

  .EpubViewer__toolbar-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .EpubViewer__progress {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    min-width: calc(var(--space-6) + var(--space-2));
    text-align: center;
  }

  .EpubViewer__body {
    position: relative;
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  .EpubViewer__toc {
    width: 280px;
    flex-shrink: 0;
    overflow-y: auto;
    border-right: 1px solid var(--border);
    background-color: var(--muted);
    padding: var(--space-2) 0;
  }

  .EpubViewer__toc-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .EpubViewer__toc-item .EpubViewer__toc-list {
    padding-left: var(--space-3);
  }

  .EpubViewer__toc-link {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
    color: var(--foreground);
    background: transparent;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .EpubViewer__toc-link:hover {
    background-color: var(--accent);
  }

  .EpubViewer__stage {
    flex: 1;
    min-width: 0;
    background-color: var(--background);
  }

  .EpubViewer__stage--hidden {
    visibility: hidden;
  }

  .EpubViewer__surface {
    width: 100%;
    height: 100%;
  }

  .EpubViewer__state {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .EpubViewer__state-text {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
  }

  .EpubViewer__state--error .EpubViewer__state-text {
    color: var(--destructive);
  }

  .EpubViewer__search-bar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background-color: var(--background);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .EpubViewer__search-input {
    font-size: var(--text-sm);
    border: none;
    outline: none;
    background: transparent;
    color: var(--foreground);
    flex: 1;
    padding: var(--space-1) 0;
  }

  .EpubViewer__search-input::placeholder {
    color: var(--muted-foreground);
  }

  .EpubViewer__search-count {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    white-space: nowrap;
    padding: 0 var(--space-1);
  }

  .EpubViewer__search-nav-btn,
  .EpubViewer__search-close-btn {
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

  .EpubViewer__search-nav-btn:hover:not(:disabled),
  .EpubViewer__search-close-btn:hover {
    background-color: var(--accent);
  }

  .EpubViewer__search-nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
