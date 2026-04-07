<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Copy, Check } from "@lucide/svelte";
  import type { EditorView } from "@codemirror/view";

  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { resolve_code_viewer_window } from "$lib/features/document/domain/code_viewer_window";
  import { create_logger } from "$lib/shared/utils/logger";

  interface Props {
    tab_id?: string;
    content: string | null;
    buffer_id?: string | null;
    line_count?: number | null;
    file_type?: string;
    filename?: string;
    wrap_lines?: boolean;
    initial_scroll_top?: number;
  }

  let {
    tab_id = "",
    content,
    buffer_id = null,
    line_count = null,
    file_type = "text",
    filename = "",
    wrap_lines = true,
    initial_scroll_top = 0,
  }: Props = $props();

  const { ports, stores } = use_app_context();
  const log = create_logger("code_viewer");

  let editor_root: HTMLDivElement | undefined = $state();
  let scroll_root: HTMLDivElement | undefined = $state();
  let view: EditorView | undefined;
  let resize_observer: ResizeObserver | undefined;
  let copied = $state(false);
  let copy_timer: ReturnType<typeof setTimeout> | undefined;
  let read_timer: ReturnType<typeof setTimeout> | undefined;
  let scroll_top = $state(0);
  let viewport_height = $state(600);
  let full_text = $state("");
  let window_text = $state("");
  let top_offset_px = $state(0);
  let total_height_px = $state(0);
  let loaded_start_line = $state(0);
  let loaded_end_line = $state(0);
  let latest_request_id = 0;
  let pending_window_key = "";
  let destroyed = false;

  const line_height_px = 21;
  const windowed_line_threshold = 5000;
  const is_buffered = $derived(
    content === null && buffer_id !== null && line_count !== null,
  );
  const is_windowed = $derived(
    is_buffered && (line_count ?? 0) > windowed_line_threshold,
  );

  async function get_full_content(): Promise<string> {
    if (content !== null) {
      return content;
    }
    if (buffer_id && line_count !== null) {
      return await ports.document.read_buffer_window(buffer_id, 0, line_count);
    }
    return "";
  }

  async function copy_content() {
    try {
      const full_content = await get_full_content();
      await navigator.clipboard.writeText(full_content);
      copied = true;
      clearTimeout(copy_timer);
      copy_timer = setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      return;
    }
  }

  function sync_editor_text(text: string) {
    if (!view) {
      return;
    }

    const current = view.state.doc.toString();
    if (current === text) {
      return;
    }

    view.dispatch({
      changes: { from: 0, to: current.length, insert: text },
    });
  }

  function schedule_window_read(force = false) {
    if (!is_windowed || !buffer_id || line_count === null) {
      return;
    }

    const next_window = resolve_code_viewer_window({
      line_count,
      scroll_top_px: scroll_top,
      viewport_height_px: viewport_height,
      line_height_px,
    });

    total_height_px = next_window.total_height_px;

    if (
      !force &&
      loaded_end_line > loaded_start_line &&
      next_window.start_line >= loaded_start_line &&
      next_window.end_line <= loaded_end_line
    ) {
      return;
    }

    const next_window_key = `${buffer_id}:${next_window.start_line}:${next_window.end_line}`;
    if (!force && pending_window_key === next_window_key) {
      return;
    }

    clearTimeout(read_timer);
    read_timer = setTimeout(async () => {
      pending_window_key = next_window_key;
      const request_id = ++latest_request_id;

      try {
        const text = await ports.document.read_buffer_window(
          buffer_id,
          next_window.start_line,
          next_window.end_line,
        );

        if (!destroyed && request_id === latest_request_id) {
          loaded_start_line = next_window.start_line;
          loaded_end_line = next_window.end_line;
          top_offset_px = next_window.top_offset_px;
          total_height_px = next_window.total_height_px;
          window_text = text;
        }
      } catch (error) {
        if (!destroyed && request_id === latest_request_id) {
          log.error("Failed to read document window", {
            error: String(error),
            buffer_id,
            start_line: next_window.start_line,
            end_line: next_window.end_line,
          });
        }
      } finally {
        pending_window_key = "";
      }
    }, 24);
  }

  function on_scroll(event: Event) {
    const target = event.currentTarget as HTMLDivElement;
    scroll_top = target.scrollTop;
    viewport_height = target.clientHeight;
    if (tab_id) {
      stores.document.update_scroll(tab_id, scroll_top);
    }
    schedule_window_read();
  }

  onMount(() => {
    let canceled = false;

    if (scroll_root) {
      viewport_height = scroll_root.clientHeight;
      scroll_root.scrollTop = initial_scroll_top;
      scroll_top = initial_scroll_top;
      resize_observer = new ResizeObserver(() => {
        viewport_height = scroll_root?.clientHeight ?? viewport_height;
        schedule_window_read();
      });
      resize_observer.observe(scroll_root);
    }

    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    const init = async () => {
      const [
        { EditorView, basicSetup },
        { EditorState },
        { LanguageDescription },
        { languages },
        dark_theme,
        initial_text,
      ] = await Promise.all([
        import("codemirror"),
        import("@codemirror/state"),
        import("@codemirror/language"),
        import("@codemirror/language-data"),
        dark ? import("@codemirror/theme-one-dark") : Promise.resolve(null),
        is_windowed ? Promise.resolve("") : get_full_content(),
      ]);

      if (canceled || !editor_root) {
        return;
      }

      const extensions = [
        basicSetup,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.theme({
          "&": {
            height: is_windowed ? "auto" : "100%",
            fontSize: "var(--text-sm, 13px)",
          },
          ".cm-scroller": {
            overflow: is_windowed ? "visible" : "auto",
            fontFamily: "var(--font-mono, monospace)",
          },
          ".cm-content": {
            padding: 0,
          },
          ".cm-focused": {
            outline: "none",
          },
        }),
      ];

      if (is_windowed) {
        extensions.push(
          EditorView.theme({
            ".cm-gutters": {
              display: "none",
            },
          }),
        );
      }

      if (!is_windowed && wrap_lines) {
        extensions.push(EditorView.lineWrapping);
      }

      if (dark_theme) {
        extensions.push(dark_theme.oneDark);
      }

      const target = filename || "file.txt";
      const lang_desc = LanguageDescription.matchFilename(languages, target);

      if (lang_desc) {
        try {
          const lang_support = await lang_desc.load();
          if (!canceled) {
            extensions.push(lang_support);
          }
        } catch (error) {
          log.warn("Failed to load language support", {
            error: String(error),
            target,
          });
        }
      }

      if (canceled || !editor_root) {
        return;
      }

      full_text = initial_text;
      view = new EditorView({
        doc: is_windowed ? window_text : full_text,
        extensions,
        parent: editor_root,
      });

      if (is_windowed) {
        viewport_height = scroll_root?.clientHeight ?? viewport_height;
        total_height_px = (line_count ?? 0) * line_height_px;
        schedule_window_read(true);
        return;
      }

      sync_editor_text(full_text);
    };

    destroyed = false;
    void init();

    return () => {
      canceled = true;
    };
  });

  onDestroy(() => {
    destroyed = true;
    clearTimeout(copy_timer);
    clearTimeout(read_timer);
    resize_observer?.disconnect();
    view?.destroy();
  });

  $effect(() => {
    if (!is_windowed && content !== null) {
      full_text = content;
      sync_editor_text(full_text);
    }
  });

  $effect(() => {
    if (is_windowed) {
      sync_editor_text(window_text);
    }
  });
</script>

<div class="CodeViewer">
  {#if is_windowed}
    <div
      class="CodeViewer__scrollport"
      bind:this={scroll_root}
      onscroll={on_scroll}
    >
      <div class="CodeViewer__spacer" style:height={`${total_height_px}px`}>
        <div
          class="CodeViewer__window"
          style:transform={`translateY(${top_offset_px}px)`}
        >
          <div class="CodeViewer__editor" bind:this={editor_root}></div>
        </div>
      </div>
    </div>
  {:else}
    <div
      class="CodeViewer__editor CodeViewer__editor--full"
      bind:this={editor_root}
    ></div>
  {/if}

  <button
    class="CodeViewer__copy"
    onclick={copy_content}
    aria-label="Copy code"
  >
    {#if copied}
      <Check class="h-3.5 w-3.5" />
      <span>Copied!</span>
    {:else}
      <Copy class="h-3.5 w-3.5" />
      <span>Copy</span>
    {/if}
  </button>
</div>

<style>
  .CodeViewer {
    position: relative;
    height: 100%;
    overflow: hidden;
    background-color: var(--background);
    color: var(--foreground);
  }

  .CodeViewer__scrollport {
    height: 100%;
    overflow: auto;
  }

  .CodeViewer__spacer {
    position: relative;
    min-height: 100%;
  }

  .CodeViewer__window {
    position: absolute;
    inset-inline: 0;
    top: 0;
  }

  .CodeViewer__editor {
    overflow: hidden;
  }

  .CodeViewer__editor--full {
    height: 100%;
  }

  .CodeViewer__copy {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background-color: var(--background);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.15s ease,
      background-color 0.15s ease;
  }

  .CodeViewer:hover .CodeViewer__copy {
    opacity: 1;
  }

  .CodeViewer__copy:hover {
    background-color: var(--accent);
    color: var(--foreground);
  }
</style>
