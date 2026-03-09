<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { CursorInfo } from "$lib/shared/types/editor";
  import type { OutlineHeading } from "$lib/features/outline";
  import { extract_headings_from_markdown } from "$lib/features/editor/domain/extract_headings";

  interface Props {
    initial_markdown: string;
    initial_cursor_offset?: number;
    initial_scroll_fraction?: number;
    on_markdown_change: (markdown: string) => void;
    on_dirty_change: (is_dirty: boolean) => void;
    on_cursor_change: (info: CursorInfo) => void;
    on_outline_change?: (headings: OutlineHeading[]) => void;
    on_destroy?: (state: {
      cursor_offset: number;
      scroll_fraction: number;
    }) => void;
  }

  let {
    initial_markdown,
    initial_cursor_offset = 0,
    initial_scroll_fraction = 0,
    on_markdown_change,
    on_dirty_change,
    on_cursor_change,
    on_outline_change,
    on_destroy,
  }: Props = $props();

  const TAB_SIZE = 4;

  let content = $state(initial_markdown);
  let textarea_el: HTMLTextAreaElement | undefined = $state();
  let ghost_el: HTMLDivElement | undefined = $state();

  let ghost_raf: number | null = null;
  let store_timer: ReturnType<typeof setTimeout> | null = null;
  let outline_timer: ReturnType<typeof setTimeout> | undefined;

  function count_newlines(s: string): number {
    let count = 1;
    let idx = -1;
    while ((idx = s.indexOf("\n", idx + 1)) !== -1) count++;
    return count;
  }

  function compute_cursor_info(): CursorInfo {
    if (!textarea_el) {
      return { line: 1, column: 1, total_lines: 1, total_words: 0 };
    }
    const pos = textarea_el.selectionStart;
    const before = content.substring(0, pos);
    const line = count_newlines(before);
    const last_newline = before.lastIndexOf("\n");
    const column = pos - last_newline;
    const total_lines = count_newlines(content);
    const total_words = content.trim() ? content.trim().split(/\s+/).length : 0;
    return { line, column, total_lines, total_words };
  }

  function sync_ghost() {
    if (!ghost_el) return;
    if (ghost_raf !== null) return;
    ghost_raf = requestAnimationFrame(() => {
      if (ghost_el) ghost_el.textContent = content + "\n";
      ghost_raf = null;
    });
  }

  $effect(() => {
    void content;
    sync_ghost();
  });

  function handle_input() {
    if (store_timer !== null) clearTimeout(store_timer);
    store_timer = setTimeout(() => {
      on_dirty_change(true);
      on_markdown_change(content);
      store_timer = null;
    }, 50);

    on_cursor_change(compute_cursor_info());

    if (on_outline_change) {
      clearTimeout(outline_timer);
      const cb = on_outline_change;
      outline_timer = setTimeout(() => {
        cb(extract_headings_from_markdown(content));
      }, 300);
    }
  }

  function handle_keydown(event: KeyboardEvent) {
    if (event.key === "Tab") {
      event.preventDefault();
      const textarea = event.target as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = " ".repeat(TAB_SIZE);
      content = content.substring(0, start) + spaces + content.substring(end);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + TAB_SIZE;
      });
    }
  }

  function handle_select() {
    on_cursor_change(compute_cursor_info());
  }

  onMount(() => {
    if (ghost_el) ghost_el.textContent = content + "\n";

    if (on_outline_change) {
      on_outline_change(extract_headings_from_markdown(content));
    }

    if (textarea_el) {
      const clamped = Math.min(initial_cursor_offset, content.length);
      textarea_el.selectionStart = clamped;
      textarea_el.selectionEnd = clamped;
      textarea_el.focus({ preventScroll: true });

      const outer = textarea_el.closest(".SourceEditor") as HTMLElement | null;
      if (initial_cursor_offset === 0 && initial_scroll_fraction === 0) {
        if (outer) outer.scrollTop = 0;
      } else if (outer) {
        requestAnimationFrame(() => {
          const max_scroll = outer.scrollHeight - outer.clientHeight;
          if (max_scroll > 0) {
            outer.scrollTop = Math.round(initial_scroll_fraction * max_scroll);
          }
        });
      }
    }
  });

  onDestroy(() => {
    let cursor_offset = 0;
    let scroll_fraction = 0;

    if (textarea_el) {
      cursor_offset = textarea_el.selectionStart;
      const outer = textarea_el.closest(".SourceEditor") as HTMLElement | null;
      if (outer && outer.scrollHeight > outer.clientHeight) {
        const max_scroll = outer.scrollHeight - outer.clientHeight;
        scroll_fraction = max_scroll > 0 ? outer.scrollTop / max_scroll : 0;
      }
    }

    if (store_timer !== null) {
      clearTimeout(store_timer);
      on_markdown_change(content);
    }

    on_destroy?.({ cursor_offset, scroll_fraction });

    if (ghost_raf !== null) cancelAnimationFrame(ghost_raf);
    if (outline_timer) clearTimeout(outline_timer);
  });

  interface MatchPos {
    from: number;
    to: number;
  }

  let search_matches: MatchPos[] = [];
  let search_index = -1;

  export function searchText(text: string, cs: boolean): number {
    search_matches = [];
    search_index = -1;
    if (!text) return 0;
    const haystack = cs ? content : content.toLowerCase();
    const needle = cs ? text : text.toLowerCase();
    let idx = 0;
    while ((idx = haystack.indexOf(needle, idx)) !== -1) {
      search_matches.push({ from: idx, to: idx + needle.length });
      idx += needle.length;
    }
    if (search_matches.length > 0) {
      search_index = 0;
      select_match(0);
    }
    return search_matches.length;
  }

  export function searchFindNext(): { current: number; total: number } {
    if (search_matches.length === 0) return { current: 0, total: 0 };
    search_index = (search_index + 1) % search_matches.length;
    select_match(search_index);
    return { current: search_index + 1, total: search_matches.length };
  }

  export function searchFindPrev(): { current: number; total: number } {
    if (search_matches.length === 0) return { current: 0, total: 0 };
    search_index =
      (search_index - 1 + search_matches.length) % search_matches.length;
    select_match(search_index);
    return { current: search_index + 1, total: search_matches.length };
  }

  export function searchReplaceCurrent(replace_with: string) {
    if (search_index < 0 || search_index >= search_matches.length) return;
    const match = search_matches[search_index];
    if (!match) return;
    content =
      content.substring(0, match.from) +
      replace_with +
      content.substring(match.to);
    on_dirty_change(true);
    on_markdown_change(content);
  }

  export function searchReplaceAll(
    search_str: string,
    replace_with: string,
    cs: boolean,
  ): number {
    if (!search_str) return 0;
    if (search_matches.length === 0) searchText(search_str, cs);
    if (search_matches.length === 0) return 0;
    const count = search_matches.length;
    for (let i = search_matches.length - 1; i >= 0; i--) {
      const m = search_matches[i];
      if (!m) continue;
      content =
        content.substring(0, m.from) + replace_with + content.substring(m.to);
    }
    on_dirty_change(true);
    on_markdown_change(content);
    clearSearch();
    return count;
  }

  export function clearSearch() {
    search_matches = [];
    search_index = -1;
  }

  function select_match(idx: number) {
    if (!textarea_el || idx < 0 || idx >= search_matches.length) return;
    const match = search_matches[idx];
    if (!match) return;
    textarea_el.focus();
    textarea_el.setSelectionRange(match.from, match.to);
    const lines_before = content.substring(0, match.from).split("\n").length;
    const line_height =
      parseFloat(getComputedStyle(textarea_el).lineHeight) || 24;
    const scroll_target = (lines_before - 3) * line_height;
    const outer = textarea_el.closest(".SourceEditor") as HTMLElement | null;
    if (outer) {
      outer.scrollTop = Math.max(0, scroll_target);
    }
  }
</script>

<div class="SourceEditor">
  <div class="SourceEditor__inner">
    <div class="SourceEditor__grow" style="tab-size: {TAB_SIZE}">
      <div
        bind:this={ghost_el}
        class="SourceEditor__ghost"
        aria-hidden="true"
      ></div>
      <textarea
        bind:this={textarea_el}
        class="SourceEditor__textarea"
        bind:value={content}
        oninput={handle_input}
        onkeydown={handle_keydown}
        onselect={handle_select}
        onclick={handle_select}
        spellcheck="true"
      ></textarea>
    </div>
  </div>
</div>

<style>
  .SourceEditor {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-width: 0;
    padding: 2rem clamp(1rem, 4%, 3rem);
    background: transparent;
  }

  .SourceEditor__inner {
    width: 100%;
    max-width: 48rem;
    margin: 0 auto;
    min-height: 100%;
    display: flex;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .SourceEditor__grow {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
    overflow: hidden;
  }

  .SourceEditor__ghost,
  .SourceEditor__textarea {
    grid-area: 1 / 1;
    font-family: "SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace;
    font-size: var(--text-sm);
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    padding: 0;
    border: none;
    margin: 0;
  }

  .SourceEditor__ghost {
    visibility: hidden;
    pointer-events: none;
  }

  .SourceEditor__textarea {
    width: 100%;
    resize: none;
    outline: none;
    background: transparent;
    color: var(--foreground);
    overflow: hidden;
  }

  .SourceEditor__textarea::placeholder {
    color: var(--muted-foreground);
  }
</style>
