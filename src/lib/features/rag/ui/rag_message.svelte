<script lang="ts">
  import { FileText } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type {
    RagCitation,
    RagMessage,
  } from "$lib/features/rag/domain/rag_types";

  type Props = { message: RagMessage };
  let { message }: Props = $props();

  const { action_registry } = use_app_context();

  const CITATION_MARKER = /\[(\d+)\]/g;

  type Segment =
    | { kind: "text"; text: string }
    | { kind: "citation"; citation: RagCitation };

  const citation_map = $derived(
    new Map(message.citations.map((c) => [c.index, c])),
  );

  const segments = $derived<Segment[]>(build_segments(message.content));

  function build_segments(content: string): Segment[] {
    const result: Segment[] = [];
    let last = 0;
    for (const match of content.matchAll(CITATION_MARKER)) {
      const index = Number(match[1]);
      const citation = citation_map.get(index);
      if (!citation || match.index === undefined) continue;
      if (match.index > last) {
        result.push({ kind: "text", text: content.slice(last, match.index) });
      }
      result.push({ kind: "citation", citation });
      last = match.index + match[0].length;
    }
    if (last < content.length) {
      result.push({ kind: "text", text: content.slice(last) });
    }
    return result;
  }

  function open_citation(citation: RagCitation) {
    void action_registry.execute(
      ACTION_IDS.rag_open_citation,
      citation.note_path,
    );
  }
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
    <div class="text-sm leading-relaxed text-foreground">
      {#each segments as segment, i (i)}
        {#if segment.kind === "text"}<span class="whitespace-pre-wrap"
            >{segment.text}</span
          >{:else}<button
            type="button"
            class="mx-0.5 inline-flex items-center rounded bg-muted px-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title={segment.citation.title}
            onclick={() => open_citation(segment.citation)}
            >[{segment.citation.index}]</button
          >{/if}
      {/each}
    </div>

    {#if message.citations.length > 0}
      <div class="flex flex-col gap-1 border-t pt-2">
        <span class="text-xs font-medium text-muted-foreground">Sources</span>
        {#each message.citations as citation (citation.index)}
          <button
            type="button"
            class="flex items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            onclick={() => open_citation(citation)}
          >
            <span class="text-muted-foreground">[{citation.index}]</span>
            <FileText class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate">{citation.title}</span>
            <span class="truncate text-muted-foreground"
              >{citation.note_path}</span
            >
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
