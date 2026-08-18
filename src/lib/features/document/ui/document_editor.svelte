<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { EditorView } from "@codemirror/view";
  import { create_logger } from "$lib/shared/utils/logger";
  import { extract_html_headings } from "$lib/features/document/domain/html_outline";

  interface Props {
    content: string;
    filename: string;
    on_change: (content: string) => void;
    wrap_lines?: boolean;
    on_active_heading_change?: (id: string | null) => void;
  }

  let {
    content,
    filename,
    on_change,
    wrap_lines = true,
    on_active_heading_change,
  }: Props = $props();

  const log = create_logger("document_editor");

  let editor_root: HTMLDivElement | undefined = $state();
  let view: EditorView | undefined;
  let scroll_to_position: ((position: number) => void) | undefined;
  let destroyed = false;

  onMount(() => {
    let canceled = false;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

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
