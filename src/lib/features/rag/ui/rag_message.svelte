<script lang="ts">
  import {
    Check,
    Copy,
    FileText,
    GitBranch,
    Loader2,
    Plus,
    RefreshCw,
    X,
  } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import CollapsibleSection from "$lib/components/ui/collapsible_section.svelte";
  import type {
    RagCitation,
    RagMessage,
  } from "$lib/features/rag/domain/rag_types";
  import {
    render_rag_markdown,
    CITATION_INDEX_ATTR,
  } from "$lib/features/rag/domain/rag_markdown";

  type Props = {
    message: RagMessage;
    is_streaming?: boolean;
    changed_files?: string[];
  };
  let { message, is_streaming = false, changed_files }: Props = $props();

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
  // statement form: the vite ssr transform drops the parens in
  // `a && (b || c)`, evaluating `c` even when the guard fails
  const show_stats = $derived.by(() => {
    if (stats === undefined) return false;
    return stats.used < stats.retrieved || stats.truncated > 0;
  });

  function open_citation(citation: RagCitation) {
    open_note(citation.note_path);
  }

  function insert_link(title: string) {
    if (!current_title) return;
    void action_registry.execute(ACTION_IDS.links_insert_suggested_link, title);
  }

  let copied = $state(false);

  async function copy_message() {
    await action_registry.execute(ACTION_IDS.rag_copy_message, message.id);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function regenerate() {
    void action_registry.execute(ACTION_IDS.rag_regenerate, message.id);
  }

  function fork() {
    void action_registry.execute(ACTION_IDS.rag_fork, message.id);
  }

  let content_el = $state<HTMLElement | null>(null);

  let reasoning_user_open = $state<boolean | null>(null);
  const reasoning_auto_open = $derived(
    is_streaming && Boolean(message.reasoning) && message.content === "",
  );
  const reasoning_open = $derived(reasoning_user_open ?? reasoning_auto_open);

  const tool_events = $derived(message.tool_events ?? []);
  let tools_user_open = $state<boolean | null>(null);
  const tools_open = $derived(tools_user_open ?? is_streaming);

  function open_note(note_path: string) {
    void action_registry.execute(ACTION_IDS.rag_open_citation, note_path);
  }

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
  <div class="group/message flex flex-col gap-2">
    {#if message.reasoning}
      <div class="rounded-md border bg-muted/20">
        <CollapsibleSection
          title="Reasoning"
          open={reasoning_open}
          on_toggle={() => (reasoning_user_open = !reasoning_open)}
        >
          <div
            class="whitespace-pre-wrap px-3 pb-2 text-xs text-muted-foreground"
          >
            {message.reasoning}
          </div>
        </CollapsibleSection>
      </div>
    {/if}
    {#if tool_events.length > 0}
      <div class="rounded-md border bg-muted/20">
        <CollapsibleSection
          title="Tool calls"
          count={tool_events.length}
          open={tools_open}
          on_toggle={() => (tools_user_open = !tools_open)}
        >
          <div class="flex flex-col gap-1 px-3 pb-2">
            {#each tool_events as event, index (index)}
              <div
                class="flex items-center gap-2 text-xs text-muted-foreground"
              >
                {#if event.ok === undefined}
                  <Loader2
                    class="size-3.5 shrink-0 animate-spin"
                    aria-label="Running"
                  />
                {:else if event.ok}
                  <Check class="size-3.5 shrink-0" aria-label="Succeeded" />
                {:else}
                  <X
                    class="size-3.5 shrink-0 text-destructive"
                    aria-label="Failed"
                  />
                {/if}
                <span class="shrink-0 font-medium text-foreground"
                  >{event.name}</span
                >
                <span class="truncate">{event.input_summary}</span>
              </div>
            {/each}
          </div>
        </CollapsibleSection>
      </div>
    {/if}
    <div
      bind:this={content_el}
      class="rag-markdown text-sm leading-relaxed text-foreground"
    >
      {@html rendered_html}{#if is_streaming}<span
          class="ml-0.5 inline-block w-1.5 animate-pulse select-none align-baseline text-foreground"
          aria-hidden="true">▍</span
        >{/if}
    </div>

    {#if !is_streaming}
      <div
        class="flex items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100"
      >
        <button
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onclick={copy_message}
          title={copied ? "Copied" : "Copy"}
          aria-label="Copy message"
        >
          {#if copied}
            <Check class="size-3.5" />
          {:else}
            <Copy class="size-3.5" />
          {/if}
        </button>
        <button
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onclick={regenerate}
          title="Regenerate"
          aria-label="Regenerate reply"
        >
          <RefreshCw class="size-3.5" />
        </button>
        <button
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onclick={fork}
          title="Fork chat from here"
          aria-label="Fork chat from here"
        >
          <GitBranch class="size-3.5" />
        </button>
      </div>
    {/if}

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

    {#if changed_files && changed_files.length > 0}
      <div class="flex flex-col gap-1 border-t pt-2">
        <span class="text-xs font-medium text-muted-foreground"
          >Changed files</span
        >
        {#each changed_files as path (path)}
          <button
            type="button"
            class="flex items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            onclick={() => open_note(path)}
          >
            <FileText class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate">{path}</span>
          </button>
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
