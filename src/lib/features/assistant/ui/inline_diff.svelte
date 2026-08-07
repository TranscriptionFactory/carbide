<script lang="ts" module>
  const GUTTER = { add: "+", del: "-", ctx: " " } as const;
</script>

<script lang="ts">
  import { compute_diff_rows } from "$lib/features/assistant/domain/tool_diff";

  type Props = {
    path: string;
    old_text: string | null;
    new_text: string;
  };

  let { path, old_text, new_text }: Props = $props();

  const rows = $derived(compute_diff_rows(old_text, new_text));

  function gap_label(count: number): string {
    return `⋯ ${String(count)} unchanged lines`;
  }
</script>

<div
  class="overflow-x-auto rounded-md border bg-muted/30 font-mono text-xs"
  data-testid="inline-diff"
>
  <p
    class="truncate border-b px-2 py-1 text-muted-foreground"
    data-testid="inline-diff-path"
  >
    {path}
  </p>
  {#each rows as row, index (index)}
    {#if row.kind === "gap"}
      <p
        class="px-2 py-0.5 text-center text-muted-foreground"
        data-testid="inline-diff-row"
        data-kind="gap"
      >
        {gap_label(row.count)}
      </p>
    {:else if row.kind === "bail"}
      <p
        class="px-2 py-0.5 italic text-muted-foreground"
        data-testid="inline-diff-row"
        data-kind="bail"
      >
        {row.reason}
      </p>
    {:else}
      <span
        class="block whitespace-pre px-2"
        class:text-chart-2={row.kind === "add"}
        class:text-destructive={row.kind === "del"}
        class:text-muted-foreground={row.kind === "ctx"}
        data-testid="inline-diff-row"
        data-kind={row.kind}>{GUTTER[row.kind]}{row.text}</span
      >
    {/if}
  {/each}
</div>
