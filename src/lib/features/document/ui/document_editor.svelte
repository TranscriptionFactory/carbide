<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { EditorView } from "@codemirror/view";
  import { create_logger } from "$lib/shared/utils/logger";

  interface Props {
    content: string;
    filename: string;
    on_change: (content: string) => void;
    wrap_lines?: boolean;
  }

  let { content, filename, on_change, wrap_lines = true }: Props = $props();

  const log = create_logger("document_editor");

  let editor_root: HTMLDivElement | undefined = $state();
  let view: EditorView | undefined;
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
</script>

<div class="DocumentEditor">
  <div class="DocumentEditor__editor" bind:this={editor_root}></div>
</div>

<style>
  .DocumentEditor {
    position: relative;
    height: 100%;
    overflow: hidden;
    background-color: var(--background);
    color: var(--foreground);
  }

  .DocumentEditor__editor {
    height: 100%;
  }
</style>
