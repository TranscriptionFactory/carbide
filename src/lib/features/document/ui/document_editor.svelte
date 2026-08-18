<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { EditorView } from "@codemirror/view";
  import { create_logger } from "$lib/shared/utils/logger";
  import { extract_html_headings } from "$lib/features/document/domain/html_outline";
  import type {
    DocumentEditorController,
    DocumentFindOptions,
  } from "$lib/features/document/ports";

  interface Props {
    content: string;
    filename: string;
    on_change: (content: string) => void;
    wrap_lines?: boolean;
    on_active_heading_change?: (id: string | null) => void;
    theme?: "light" | "dark";
    on_controller_change?: (
      controller: DocumentEditorController | null,
    ) => void;
  }

  let {
    content,
    filename,
    on_change,
    wrap_lines = true,
    on_active_heading_change,
    theme = "light",
    on_controller_change,
  }: Props = $props();

  const log = create_logger("document_editor");

  let editor_root: HTMLDivElement | undefined = $state();
  let view: EditorView | undefined;
  let scroll_to_position: ((position: number) => void) | undefined;
  let reveal_position: ((position: number) => void) | undefined;
  let matches: Array<{ from: number; to: number }> = [];
  let find_query = "";
  let find_options: DocumentFindOptions = {
    case_sensitive: false,
    whole_word: false,
  };
  let find_listener: Parameters<
    DocumentEditorController["update_find_state"]
  >[3];
  let destroyed = false;

  onMount(() => {
    let canceled = false;
    const dark = theme === "dark";

    const init = async () => {
      const [
        { EditorView: EV, basicSetup },
        { EditorState },
        { LanguageDescription },
        { languages },
        dark_theme,
      ] = await Promise.all([
        import("codemirror"),
        import("@codemirror/state"),
        import("@codemirror/language"),
        import("@codemirror/language-data"),
        dark ? import("@codemirror/theme-one-dark") : Promise.resolve(null),
      ]);

      if (canceled || !editor_root) return;

      const extensions = [
        basicSetup,
        EV.theme({
          "&": {
            height: "100%",
            fontSize: "var(--text-sm, 13px)",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily: "var(--font-mono, monospace)",
          },
          ".cm-content": {
            padding: 0,
          },
          ".cm-focused": {
            outline: "none",
          },
        }),
        EV.updateListener.of((update) => {
          if (update.docChanged) {
            on_change(update.state.doc.toString());
            if (find_query)
              update_find_state(find_query, 0, find_options, find_listener);
          }
          if (update.selectionSet && filename.toLowerCase().endsWith(".html")) {
            const source = update.state.doc.toString();
            const cursor = update.state.selection.main.head;
            const matches = [...source.matchAll(/<h[1-6]\b/gi)].filter(
              (match) => (match.index ?? 0) <= cursor,
            );
            const headings = extract_html_headings(source);
            on_active_heading_change?.(
              headings[Math.max(0, matches.length - 1)]?.id ?? null,
            );
          }
        }),
      ];

      if (wrap_lines) {
        extensions.push(EV.lineWrapping);
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

      if (canceled || !editor_root) return;

      view = new EV({
        doc: content,
        extensions,
        parent: editor_root,
      });
      scroll_to_position = (position) => {
        view?.dispatch({
          selection: { anchor: position },
          effects: EV.scrollIntoView(position, { y: "start" }),
        });
        view?.focus();
      };
      reveal_position = (position) => {
        view?.dispatch({
          effects: EV.scrollIntoView(position, { y: "center" }),
        });
      };
      on_controller_change?.({
        get_selection_range,
        update_find_state,
        replace_at_match,
        replace_all_matches,
      });
    };

    destroyed = false;
    void init();

    return () => {
      canceled = true;
    };
  });

  onDestroy(() => {
    destroyed = true;
    view?.destroy();
    on_controller_change?.(null);
  });

  $effect(() => {
    if (!view || destroyed) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }
  });

  export function scroll_to_heading(id: string) {
    if (!view) return;
    const source = view.state.doc.toString();
    const headings = extract_html_headings(source);
    const index = headings.findIndex((heading) => heading.id === id);
    if (index < 0) return;
    const match = [...source.matchAll(/<h[1-6]\b/gi)][index];
    if (match?.index === undefined) return;
    scroll_to_position?.(match.index);
  }

  function get_selection_range() {
    if (!view) return null;
    const { from, to } = view.state.selection.main;
    if (from === to) return null;
    return { from, to, text: view.state.sliceDoc(from, to) };
  }

  function collect_matches(query: string, options: DocumentFindOptions) {
    if (!view || !query) return [];
    const source = view.state.doc.toString();
    const haystack = options.case_sensitive ? source : source.toLowerCase();
    const needle = options.case_sensitive ? query : query.toLowerCase();
    const start =
      options.scope === "selection" ? (options.range?.from ?? 0) : 0;
    const end =
      options.scope === "selection"
        ? (options.range?.to ?? source.length)
        : source.length;
    const result: Array<{ from: number; to: number }> = [];
    let cursor = start;
    while (cursor <= end - needle.length) {
      const found = haystack.indexOf(needle, cursor);
      if (found < 0 || found + needle.length > end) break;
      const before = source[found - 1] ?? "";
      const after = source[found + needle.length] ?? "";
      if (
        !options.whole_word ||
        (!/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after))
      ) {
        result.push({ from: found, to: found + needle.length });
      }
      cursor = found + Math.max(1, needle.length);
    }
    return result;
  }

  function update_find_state(
    query: string,
    selected_index: number,
    options: DocumentFindOptions,
    listener?: Parameters<DocumentEditorController["update_find_state"]>[3],
  ): number {
    find_query = query;
    find_options = options;
    find_listener = listener;
    matches = collect_matches(query, options);
    const selected =
      matches.length === 0 ? 0 : Math.min(selected_index, matches.length - 1);
    const match = matches[selected];
    if (match && view) {
      view.dispatch({
        selection: { anchor: match.from, head: match.to },
      });
      reveal_position?.(match.from);
    }
    listener?.({
      match_count: matches.length,
      selected_index: selected,
      range: options.range ?? null,
    });
    return matches.length;
  }

  function replace_at_match(match_index: number, replacement: string) {
    const match = matches[match_index];
    if (!view || !match)
      return { match_count: matches.length, selected_index: 0 };
    view.dispatch({
      changes: { from: match.from, to: match.to, insert: replacement },
    });
    const count = update_find_state(
      find_query,
      match_index,
      find_options,
      find_listener,
    );
    return {
      match_count: count,
      selected_index: Math.min(match_index, Math.max(0, count - 1)),
    };
  }

  function replace_all_matches(replacement: string) {
    if (!view || matches.length === 0)
      return { match_count: 0, selected_index: 0 };
    view.dispatch({
      changes: matches.map((match) => ({
        from: match.from,
        to: match.to,
        insert: replacement,
      })),
    });
    const count = update_find_state(find_query, 0, find_options, find_listener);
    return { match_count: count, selected_index: 0 };
  }
</script>

<div class="DocumentEditor">
  <div class="DocumentEditor__editor" bind:this={editor_root}></div>
</div>

<style>
  .DocumentEditor {
    position: relative;
    height: 100%;
    overflow: hidden;
    background-color: var(--editor-background);
    color: var(--editor-foreground);
  }

  .DocumentEditor__editor {
    height: 100%;
  }
</style>
