<script lang="ts">
  import { EditorView } from "@codemirror/view";
  import { EditorState } from "@codemirror/state";
  import { LanguageDescription } from "@codemirror/language";
  import { languages } from "@codemirror/language-data";
  import { oneDark } from "@codemirror/theme-one-dark";
  import { basicSetup } from "codemirror";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import CheckIcon from "@lucide/svelte/icons/check";

  interface Props {
    content: string;
    file_name: string;
  }

  let { content, file_name }: Props = $props();

  let container_el: HTMLDivElement | undefined = $state();
  let editor_view: EditorView | undefined;
  let copied = $state(false);

  const height_theme = EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "var(--text-sm)",
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
  });

  async function build_extensions(name: string) {
    const desc = LanguageDescription.matchFilename(languages, name);
    const lang_support = desc ? await desc.load() : [];
    return [
      basicSetup,
      oneDark,
      height_theme,
      EditorState.readOnly.of(true),
      ...(Array.isArray(lang_support) ? lang_support : [lang_support]),
    ];
  }

  async function mount_editor(node: HTMLDivElement) {
    const extensions = await build_extensions(file_name);

    editor_view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions,
      }),
      parent: node,
    });
  }

  $effect(() => {
    if (!container_el) return;

    void mount_editor(container_el);

    return () => {
      editor_view?.destroy();
      editor_view = undefined;
    };
  });

  $effect(() => {
    if (!editor_view) return;
    const current_content = content;
    const view = editor_view;

    if (view.state.doc.toString() !== current_content) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: current_content,
        },
      });
    }
  });

  let copy_reset_timer: ReturnType<typeof setTimeout> | undefined;

  async function copy_all() {
    clearTimeout(copy_reset_timer);
    await navigator.clipboard.writeText(content);
    copied = true;
    copy_reset_timer = setTimeout(() => {
      copied = false;
    }, 2000);
  }

  $effect(() => {
    return () => clearTimeout(copy_reset_timer);
  });
</script>

<div class="CodeViewer">
  <button
    class="CodeViewer__copy-btn"
    onclick={copy_all}
    aria-label="Copy all"
    title="Copy all"
  >
    {#if copied}
      <CheckIcon class="CodeViewer__copy-icon CodeViewer__copy-icon--check" />
    {:else}
      <CopyIcon class="CodeViewer__copy-icon" />
    {/if}
  </button>

  <div class="CodeViewer__editor" bind:this={container_el}></div>
</div>

<style>
  .CodeViewer {
    position: relative;
    height: 100%;
    overflow: hidden;
  }

  .CodeViewer__editor {
    height: 100%;
    overflow: hidden;
  }

  .CodeViewer__copy-btn {
    position: absolute;
    top: var(--space-2);
    right: var(--space-2-5);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--size-touch-xs);
    height: var(--size-touch-xs);
    border-radius: var(--radius-md);
    background-color: var(--muted);
    color: var(--muted-foreground);
    border: none;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity var(--duration-fast) var(--ease-default),
      color var(--duration-fast) var(--ease-default),
      background-color var(--duration-fast) var(--ease-default);
  }

  .CodeViewer:hover .CodeViewer__copy-btn {
    opacity: 1;
  }

  .CodeViewer__copy-btn:hover {
    color: var(--foreground);
    background-color: var(--border);
  }

  .CodeViewer__copy-btn:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
    opacity: 1;
  }

  :global(.CodeViewer__copy-icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }

  :global(.CodeViewer__copy-icon--check) {
    color: var(--interactive);
  }
</style>
