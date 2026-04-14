<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import type {
    CursorInfo,
    EditorSelectionSnapshot,
  } from "$lib/shared/types/editor";
  import type { OutlineHeading } from "$lib/features/outline";
  import { extract_headings_from_markdown } from "$lib/features/editor/domain/extract_headings";
  import { sync_source_editor_markdown } from "$lib/features/editor/domain/source_editor_sync";
  import {
    build_source_editor_background_theme_spec,
    build_source_editor_base_theme_spec,
    build_source_editor_hide_line_numbers_theme_spec,
    build_source_editor_syntax_theme_spec,
  } from "$lib/features/editor/ui/source_editor_theme";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app/action_registry/action_ids";

  import type { EditorView } from "@codemirror/view";
  import type { Diagnostic } from "$lib/features/diagnostics";

  interface Props {
    initial_markdown: string;
    initial_cursor_offset?: number;
    initial_scroll_fraction?: number;
    show_line_numbers?: boolean;
    on_markdown_change: (markdown: string) => void;
    on_dirty_change: (is_dirty: boolean) => void;
    on_cursor_change: (info: CursorInfo) => void;
    on_selection_change?: (selection: EditorSelectionSnapshot | null) => void;
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
    show_line_numbers = true,
    on_markdown_change,
    on_dirty_change,
    on_cursor_change,
    on_selection_change,
    on_outline_change,
    on_destroy,
  }: Props = $props();

  const { stores, action_registry } = use_app_context();

  let editor_root: HTMLDivElement | undefined = $state();
  let view: EditorView | undefined;
  let view_mounted = $state(false);
  let last_applied_markdown: string | null = null;
  let dispatching_from_store = false;
  let store_timer: ReturnType<typeof setTimeout> | null = null;
  let outline_timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  let mounted_markdown_change: ((markdown: string) => void) | null = null;

  function get_content(): string {
    return view?.state.doc.toString() ?? "";
  }

  function compute_cursor_info(): CursorInfo {
    if (!view) {
      return { line: 1, column: 1, total_lines: 1, total_words: 0 };
    }
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const total_lines = view.state.doc.lines;
    const content = view.state.doc.toString();
    const total_words = content.trim() ? content.trim().split(/\s+/).length : 0;
    return {
      line: line.number,
      column: pos - line.from + 1,
      total_lines,
      total_words,
    };
  }

  function compute_selection_snapshot(): EditorSelectionSnapshot | null {
    if (!view) return null;
    const { from, to } = view.state.selection.main;
    if (from === to) return null;
    return {
      text: view.state.sliceDoc(from, to),
      start: from,
      end: to,
    };
  }

  function queue_store_sync() {
    on_dirty_change(true);
    if (store_timer !== null) clearTimeout(store_timer);
    store_timer = setTimeout(() => {
      on_markdown_change(get_content());
      store_timer = null;
    }, 50);
  }

  function queue_outline_sync(content: string) {
    if (!on_outline_change) return;
    clearTimeout(outline_timer);
    const cb = on_outline_change;
    outline_timer = setTimeout(() => {
      cb(extract_headings_from_markdown(content));
    }, 300);
  }

  $effect.pre(() => {
    if (!view_mounted || !view) return;
    const store_markdown =
      stores.editor.open_note?.markdown ?? initial_markdown;
    const current_content = untrack(() => get_content());
    const next_state = sync_source_editor_markdown({
      content: current_content,
      applied_markdown: last_applied_markdown,
      next_markdown: store_markdown,
    });

    if (next_state.content === current_content) {
      last_applied_markdown = next_state.applied_markdown;
      return;
    }

    last_applied_markdown = next_state.applied_markdown;
    const doc = view.state.doc;
    dispatching_from_store = true;
    view.dispatch({
      changes: { from: 0, to: doc.length, insert: next_state.content },
    });
    dispatching_from_store = false;

    on_selection_change?.(compute_selection_snapshot());
    if (on_outline_change) {
      on_outline_change(extract_headings_from_markdown(next_state.content));
    }
  });

  let prev_diagnostics: Diagnostic[] = [];

  $effect(() => {
    if (!view_mounted || !view) return;
    const diagnostics = stores.diagnostics.active_diagnostics;
    if (diagnostics === prev_diagnostics) return;
    prev_diagnostics = diagnostics;

    import("$lib/features/lint/editor/cm_lint_source").then(
      ({ update_cm_diagnostics }) => {
        if (!view || destroyed) return;
        update_cm_diagnostics(view, diagnostics, () => {
          void action_registry.execute(ACTION_IDS.lint_fix_all);
        });
      },
    );
  });

  onMount(() => {
    let canceled = false;
    destroyed = false;

    const init = async () => {
      const [
        { EditorView: EV, basicSetup },
        { EditorState },
        { markdown, markdownLanguage },
        { languages },
        lint_ext,
        cm_view_mod,
        cm_state_mod,
      ] = await Promise.all([
        import("codemirror"),
        import("@codemirror/state"),
        import("@codemirror/lang-markdown"),
        import("@codemirror/language-data"),
        import("$lib/features/lint/editor/cm_lint_source"),
        import("@codemirror/view"),
        import("@codemirror/state"),
      ]);

      if (canceled || !editor_root) return;

      const update_listener = cm_view_mod.EditorView.updateListener.of(
        (update) => {
          if (update.docChanged && !dispatching_from_store) {
            queue_store_sync();
            queue_outline_sync(update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
            on_cursor_change(compute_cursor_info());
            on_selection_change?.(compute_selection_snapshot());
            stores.editor.set_cursor_offset(update.state.selection.main.head);
          }
        },
      );

      const { keymap: cm_keymap } = cm_view_mod;
      const { indentWithTab } = await import("@codemirror/commands");

      const extensions = [
        basicSetup,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        ...lint_ext.create_lint_extensions(),
        cm_keymap.of([indentWithTab]),
        update_listener,
        EV.lineWrapping,
        EV.theme(build_source_editor_base_theme_spec()),
      ];

      if (!show_line_numbers) {
        extensions.push(
          EV.theme(build_source_editor_hide_line_numbers_theme_spec()),
        );
      }

      extensions.push(EV.theme(build_source_editor_syntax_theme_spec()));
      extensions.push(EV.theme(build_source_editor_background_theme_spec()));

      last_applied_markdown = initial_markdown;
      mounted_markdown_change = on_markdown_change;

      view = new EV({
        doc: initial_markdown,
        extensions,
        parent: editor_root,
      });
      view_mounted = true;

      if (initial_cursor_offset > 0) {
        const clamped = Math.min(initial_cursor_offset, view.state.doc.length);
        view.dispatch({
          selection: { anchor: clamped },
          scrollIntoView: false,
        });
      }

      if (initial_scroll_fraction > 0) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!view) return;
            const scroller = editor_root?.querySelector(".cm-scroller");
            if (!scroller) return;
            const max_scroll = scroller.scrollHeight - scroller.clientHeight;
            if (max_scroll > 0) {
              scroller.scrollTop = Math.round(
                initial_scroll_fraction * max_scroll,
              );
            }
          });
        });
      }

      view.focus();
      on_cursor_change(compute_cursor_info());
      on_selection_change?.(compute_selection_snapshot());

      if (on_outline_change) {
        on_outline_change(extract_headings_from_markdown(initial_markdown));
      }

      stores.editor.set_source_content_getter(get_content);
    };

    void init();

    return () => {
      canceled = true;
    };
  });

  onDestroy(() => {
    destroyed = true;
    view_mounted = false;
    let cursor_offset = 0;
    let scroll_fraction = 0;

    if (view) {
      cursor_offset = view.state.selection.main.head;
      const scroller = editor_root?.querySelector(".cm-scroller");
      if (scroller && scroller.scrollHeight > scroller.clientHeight) {
        const max_scroll = scroller.scrollHeight - scroller.clientHeight;
        scroll_fraction = max_scroll > 0 ? scroller.scrollTop / max_scroll : 0;
      }
    }

    if (store_timer !== null) {
      clearTimeout(store_timer);
      (mounted_markdown_change ?? on_markdown_change)(get_content());
    }

    stores.editor.clear_source_content_getter();

    on_destroy?.({ cursor_offset, scroll_fraction });

    clearTimeout(outline_timer);
    view?.destroy();
    view = undefined;
  });

  $effect(() => {
    if (!view) return;
    const enabled = stores.ui.editor_settings.editor_spellcheck;
    const content_el = view.contentDOM;
    content_el.setAttribute("spellcheck", String(enabled));
  });
</script>

<div class="SourceEditor" bind:this={editor_root}></div>

<style>
  .SourceEditor {
    flex: 1;
    overflow: hidden;
    min-width: 0;
    background: transparent;
    height: 100%;
  }
</style>
