<script lang="ts">
  import { type EditorView } from "@milkdown/kit/prose/view";
  import { type Node as ProseNode } from "@milkdown/kit/prose/model";
  import katex from "katex";

  let {
    node,
    view,
    get_pos,
  }: {
    node: ProseNode;
    view: EditorView;
    get_pos: () => number | undefined;
  } = $props();

  let editing = $state(false);
  let latex_source = $state("");
  let preview_html = $state("");
  let debounce_timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const current_value = node.attrs["value"] as string;
    if (!editing) {
      latex_source = current_value;
    }
    render_preview(current_value);
  });

  function render_preview(source: string) {
    try {
      preview_html = katex.renderToString(source || "\\text{empty}", {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      preview_html = `<span class="math-block-error">${source}</span>`;
    }
  }

  function on_input(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    latex_source = target.value;
    clearTimeout(debounce_timer);
    debounce_timer = setTimeout(() => {
      render_preview(latex_source);
    }, 200);
  }

  function apply() {
    const pos = get_pos();
    if (pos === undefined) return;

    if (!latex_source.trim()) {
      const tr = view.state.tr.delete(pos, pos + node.nodeSize);
      view.dispatch(tr);
      editing = false;
      return;
    }

    const tr = view.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      value: latex_source,
    });
    view.dispatch(tr);
    editing = false;
  }

  function cancel() {
    latex_source = node.attrs["value"] as string;
    render_preview(latex_source);
    editing = false;
  }

  function enter_edit() {
    latex_source = node.attrs["value"] as string;
    render_preview(latex_source);
    editing = true;
  }

  function on_keydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      apply();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }
</script>

<div class="math-block-container" class:math-block-container--editing={editing}>
  {#if editing}
    <div class="math-block-container__editor">
      <textarea
        class="math-block-container__textarea"
        value={latex_source}
        oninput={on_input}
        onkeydown={on_keydown}
        rows={4}
        spellcheck={false}
        autofocus
      ></textarea>
      <div class="math-block-container__live-preview">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        {@html preview_html}
      </div>
      <div class="math-block-container__actions">
        <button
          type="button"
          class="math-block-container__btn math-block-container__btn--apply"
          onmousedown={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          Apply
        </button>
        <button
          type="button"
          class="math-block-container__btn math-block-container__btn--cancel"
          onmousedown={(e) => {
            e.preventDefault();
            cancel();
          }}
        >
          Cancel
        </button>
        <span class="math-block-container__hint"
          >Cmd+Enter to apply · Esc to cancel</span
        >
      </div>
    </div>
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="math-block-container__preview"
      onclick={enter_edit}
      role="button"
      tabindex="0"
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") enter_edit();
      }}
    >
      {#if (node.attrs["value"] as string).trim()}
        {@html preview_html}
      {:else}
        <span class="math-block-placeholder"
          >Click to enter math expression…</span
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  .math-block-container {
    display: block;
    margin: var(--editor-spacing, 1.5rem) 0;
    border: 1px solid var(--border);
    border-radius: var(--radius, 0.375rem);
    overflow: hidden;
  }

  .math-block-container__preview {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1rem 1.5rem;
    cursor: pointer;
    min-height: 3rem;
  }

  .math-block-container__preview:hover {
    background: color-mix(in oklch, var(--muted) 40%, transparent);
  }

  .math-block-placeholder {
    color: var(--muted-foreground);
    font-size: 0.875rem;
    font-style: italic;
  }

  .math-block-container__editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--background-surface-2, var(--muted));
  }

  .math-block-container__textarea {
    width: 100%;
    font-family: var(--font-mono, monospace);
    font-size: 0.875rem;
    padding: 0.5rem;
    background: var(--background);
    color: var(--foreground);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius, 0.375rem) * 0.5);
    resize: vertical;
    outline: none;
    box-sizing: border-box;
  }

  .math-block-container__textarea:focus {
    border-color: var(--primary);
  }

  .math-block-container__live-preview {
    display: flex;
    justify-content: center;
    padding: 0.75rem;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius, 0.375rem) * 0.5);
    min-height: 2.5rem;
    overflow-x: auto;
  }

  .math-block-container__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .math-block-container__btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    border-radius: calc(var(--radius, 0.375rem) * 0.5);
    cursor: pointer;
    border: 1px solid transparent;
  }

  .math-block-container__btn--apply {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .math-block-container__btn--apply:hover {
    opacity: 0.9;
  }

  .math-block-container__btn--cancel {
    background: transparent;
    color: var(--muted-foreground);
    border-color: var(--border);
  }

  .math-block-container__btn--cancel:hover {
    background: var(--muted);
    color: var(--foreground);
  }

  .math-block-container__hint {
    font-size: 0.7rem;
    color: var(--muted-foreground);
    margin-left: auto;
  }
</style>
