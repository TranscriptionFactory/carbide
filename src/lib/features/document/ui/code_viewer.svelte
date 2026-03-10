<script lang="ts">
  import { onMount } from "svelte";
  import { Copy, Check } from "@lucide/svelte";
  import type { EditorView } from "@codemirror/view";

  interface Props {
    content: string;
    file_type?: string;
    filename?: string;
    wrap_lines?: boolean;
  }

  let {
    content,
    file_type = "text",
    filename = "",
    wrap_lines = true,
  }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let view: EditorView | undefined;
  let copied = $state(false);
  let copy_timer: ReturnType<typeof setTimeout> | undefined;

  async function copy_content() {
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
      clearTimeout(copy_timer);
      copy_timer = setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      // silently fail
    }
  }

  onMount(() => {
    let destroyed = false;

    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    Promise.all([
      import("codemirror"),
      import("@codemirror/state"),
      import("@codemirror/language"),
      import("@codemirror/language-data"),
      dark ? import("@codemirror/theme-one-dark") : Promise.resolve(null),
    ]).then(
      async ([
        { EditorView, basicSetup },
        { EditorState },
        { LanguageDescription },
        { languages },
        dark_theme,
      ]) => {
        if (destroyed || !container) return;

        const extensions = [
          basicSetup,
          EditorState.readOnly.of(true),
          EditorView.theme({
            "&": { height: "100%", fontSize: "var(--text-sm, 13px)" },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: "var(--font-mono, monospace)",
            },
          }),
        ];

        if (wrap_lines) {
          extensions.push(EditorView.lineWrapping);
        }

        if (dark_theme) {
          extensions.push(dark_theme.oneDark);
        }

        const target =
          filename || (file_type === "code" ? "file.ts" : "file.txt");
        const lang_desc = LanguageDescription.matchFilename(languages, target);

        if (lang_desc) {
          try {
            const lang_support = await lang_desc.load();
            if (!destroyed) extensions.push(lang_support);
          } catch {
            // language load failed, proceed without highlighting
          }
        }

        if (destroyed || !container) return;

        view = new EditorView({
          doc: content,
          extensions,
          parent: container,
        });
      },
    );

    return () => {
      destroyed = true;
      clearTimeout(copy_timer);
      view?.destroy();
    };
  });

  $effect(() => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }
  });
</script>

<div class="CodeViewer">
  <div class="CodeViewer__editor" bind:this={container}></div>
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

  .CodeViewer__editor {
    height: 100%;
    overflow: hidden;
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
