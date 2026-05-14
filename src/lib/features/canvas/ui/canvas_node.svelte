<script lang="ts">
  import type { CanvasNode } from "$lib/features/canvas/types/canvas";

  interface Props {
    node: CanvasNode;
    rendered_content?: string | null;
  }

  let { node, rendered_content = null }: Props = $props();

  const node_color = $derived(
    node.color ? `var(--canvas-color-${node.color}, ${node.color})` : undefined,
  );
</script>

<div
  class="CanvasNode CanvasNode--{node.type}"
  style:left="{node.x}px"
  style:top="{node.y}px"
  style:width="{node.width}px"
  style:height="{node.height}px"
  style:--node-color={node_color}
>
  {#if node.type === "text"}
    <div class="CanvasNode__content CanvasNode__content--text">
      {node.text}
    </div>
  {:else if node.type === "file"}
    {#if rendered_content}
      <div class="CanvasNode__content CanvasNode__content--note">
        <div class="CanvasNode__note-header">
          {node.file.split("/").pop()}
        </div>
        <div class="CanvasNode__note-body">
          {@html rendered_content}
        </div>
      </div>
    {:else}
      <div class="CanvasNode__content CanvasNode__content--file">
        <span class="CanvasNode__icon">📄</span>
        <span class="CanvasNode__label">{node.file.split("/").pop()}</span>
      </div>
    {/if}
  {:else if node.type === "link"}
    <div class="CanvasNode__content CanvasNode__content--link">
      <span class="CanvasNode__icon">🔗</span>
      <span class="CanvasNode__label">{node.url}</span>
    </div>
  {:else if node.type === "group"}
    {#if node.label}
      <div class="CanvasNode__group-label">{node.label}</div>
    {/if}
  {/if}
</div>

<style>
  .CanvasNode {
    position: absolute;
    border-radius: 6px;
    overflow: hidden;
    box-sizing: border-box;
    pointer-events: auto;
  }

  .CanvasNode--text,
  .CanvasNode--file,
  .CanvasNode--link {
    background: var(--node-color, var(--card));
    border: 1px solid var(--border);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
  }

  .CanvasNode--group {
    background: var(--node-color, var(--muted));
    border: 1.5px dashed var(--border);
    opacity: 0.6;
  }

  .CanvasNode__content {
    padding: 12px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--foreground);
    height: 100%;
    overflow: hidden;
  }

  .CanvasNode__content--text {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .CanvasNode__content--file,
  .CanvasNode__content--link {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .CanvasNode__icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .CanvasNode__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted-foreground);
    font-size: 12px;
  }

  .CanvasNode__group-label {
    position: absolute;
    top: -20px;
    left: 4px;
    font-size: 11px;
    font-weight: 500;
    color: var(--muted-foreground);
    white-space: nowrap;
  }

  .CanvasNode__content--note {
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
  }

  .CanvasNode__note-header {
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted-foreground);
    border-bottom: 1px solid var(--border);
    background: var(--accent);
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .CanvasNode__note-body {
    padding: 8px 10px;
    overflow-y: auto;
    flex: 1;
    font-size: 12px;
    line-height: 1.5;
    color: var(--foreground);
  }

  .CanvasNode__note-body :global(h1) {
    font-size: 15px;
    font-weight: 700;
    margin: 0 0 6px;
  }
  .CanvasNode__note-body :global(h2) {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 4px;
  }
  .CanvasNode__note-body :global(h3),
  .CanvasNode__note-body :global(h4),
  .CanvasNode__note-body :global(h5),
  .CanvasNode__note-body :global(h6) {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 4px;
  }
  .CanvasNode__note-body :global(p) {
    margin: 0 0 6px;
  }
  .CanvasNode__note-body :global(ul),
  .CanvasNode__note-body :global(ol) {
    margin: 0 0 6px;
    padding-left: 16px;
  }
  .CanvasNode__note-body :global(li) {
    margin-bottom: 2px;
  }
  .CanvasNode__note-body :global(pre) {
    margin: 0 0 6px;
    padding: 6px 8px;
    background: var(--muted);
    border-radius: 4px;
    overflow-x: auto;
    font-size: 11px;
  }
  .CanvasNode__note-body :global(code) {
    font-size: 11px;
    padding: 1px 3px;
    background: var(--muted);
    border-radius: 2px;
  }
  .CanvasNode__note-body :global(pre code) {
    padding: 0;
    background: none;
  }
  .CanvasNode__note-body :global(blockquote) {
    margin: 0 0 6px;
    padding-left: 8px;
    border-left: 2px solid var(--border);
    color: var(--muted-foreground);
  }
  .CanvasNode__note-body :global(a) {
    color: var(--primary);
    text-decoration: none;
  }
  .CanvasNode__note-body :global(hr) {
    border: none;
    border-top: 1px solid var(--border);
    margin: 6px 0;
  }
  .CanvasNode__note-body :global(table) {
    border-collapse: collapse;
    margin: 0 0 6px;
    font-size: 11px;
    width: 100%;
  }
  .CanvasNode__note-body :global(th),
  .CanvasNode__note-body :global(td) {
    border: 1px solid var(--border);
    padding: 3px 6px;
  }
  .CanvasNode__note-body :global(th) {
    background: var(--muted);
    font-weight: 600;
  }
</style>
