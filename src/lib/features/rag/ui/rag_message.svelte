<script lang="ts">
  import { FileText, Plus } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type {
    RagCitation,
    RagMessage,
  } from "$lib/features/rag/domain/rag_types";
  import {
    render_rag_markdown,
    CITATION_INDEX_ATTR,
  } from "$lib/features/rag/domain/rag_markdown";

  type Props = { message: RagMessage; is_streaming?: boolean };
  let { message, is_streaming = false }: Props = $props();

  const { stores, action_registry } = use_app_context();

  const current_title = $derived(
    stores.editor.open_note?.meta.title ||
      stores.editor.open_note?.meta.name ||
      "",
  );

  const citation_map = $derived(
    new Map(message.citations.map((c) => [c.index, c])),
  );

  const rendered_html = $derived(
    render_rag_markdown(message.content, citation_map),
  );

  const stats = $derived(message.context_stats);
  const show_stats = $derived(
    stats !== undefined &&
      (stats.used < stats.retrieved || stats.truncated > 0),
  );

  function open_citation(citation: RagCitation) {
    void action_registry.execute(
      ACTION_IDS.rag_open_citation,
      citation.note_path,
    );
  }

  function insert_link(title: string) {
    if (!current_title) return;
    void action_registry.execute(ACTION_IDS.links_insert_suggested_link, title);
  }

  let content_el = $state<HTMLElement | null>(null);

  $effect(() => {
    const el = content_el;
    if (!el) return;
    const on_click = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest(
        `[${CITATION_INDEX_ATTR}]`,
      );
      if (!target) return;
      const index = Number(target.getAttribute(CITATION_INDEX_ATTR));
      const citation = citation_map.get(index);
      if (citation) open_citation(citation);
    };
    el.addEventListener("click", on_click);
    return () => el.removeEventListener("click", on_click);
  });
</script>

{#if message.role === "user"}
  <div class="flex justify-end">
    <div
      class="max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
    >
      {message.content}
    </div>
  </div>
{:else}
  <div class="flex flex-col gap-2">
    <div
      bind:this={content_el}
      class="rag-markdown text-sm leading-relaxed text-foreground"
    >
      {@html rendered_html}{#if is_streaming}<span
          class="ml-0.5 inline-block w-1.5 animate-pulse select-none align-baseline text-foreground"
          aria-hidden="true">▍</span
        >{/if}
    </div>

    {#if message.citations.length > 0 || show_stats}
      <div class="flex flex-col gap-1 border-t pt-2">
        <span class="text-xs font-medium text-muted-foreground">Sources</span>
        {#if show_stats && stats}
          <span class="text-xs text-muted-foreground"
            >Using {stats.used} of {stats.retrieved} retrieved notes{stats.truncated >
            0
              ? ` (${stats.truncated} truncated to fit)`
              : ""}</span
          >
        {/if}
        {#each message.citations as citation (citation.index)}
          <div class="group flex items-center gap-1">
            <button
              type="button"
              class="flex flex-1 items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
              onclick={() => open_citation(citation)}
            >
              <span class="text-muted-foreground">[{citation.index}]</span>
              <FileText class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="truncate">{citation.title}</span>
              <span class="truncate text-muted-foreground"
                >{citation.note_path}</span
              >
            </button>
            <button
              type="button"
              class="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-accent-foreground group-hover:opacity-100 disabled:cursor-default disabled:opacity-0"
              onclick={() => insert_link(citation.title)}
              disabled={!current_title}
              title="Insert link"
              aria-label="Insert link"
            >
              <Plus class="size-3.5" />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .rag-markdown :global(> :not(:last-child)) {
    margin-bottom: 0.5rem;
  }
  .rag-markdown :global(ul),
  .rag-markdown :global(ol) {
    padding-left: 1.25rem;
  }
  .rag-markdown :global(ul) {
    list-style: disc;
  }
  .rag-markdown :global(ol) {
    list-style: decimal;
  }
  .rag-markdown :global(pre) {
    overflow-x: auto;
    border-radius: calc(var(--radius) - 2px);
    background: var(--muted);
    padding: 0.5rem;
  }
  .rag-markdown :global(code) {
    font-family: var(--font-mono, monospace);
    font-size: 0.85em;
  }
  .rag-markdown :global(blockquote) {
    border-left: 2px solid var(--border);
    padding-left: 0.75rem;
    color: var(--muted-foreground);
  }
  .rag-markdown :global(h1),
  .rag-markdown :global(h2),
  .rag-markdown :global(h3),
  .rag-markdown :global(h4) {
    font-weight: 600;
  }
</style>
