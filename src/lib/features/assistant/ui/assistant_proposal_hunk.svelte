<script lang="ts">
  import * as Switch from "$lib/components/ui/switch/index.js";
  import type { ProposalHunk } from "$lib/features/assistant/types/proposal";

  interface Props {
    hunk: ProposalHunk;
    selected: boolean;
    on_toggle: (selected: boolean) => void;
  }

  let { hunk, selected, on_toggle }: Props = $props();

  const LINE_PREFIX = { context: " ", add: "+", del: "-" } as const;

  function line_text(line: ProposalHunk["lines"][number]): string {
    return `${LINE_PREFIX[line.kind]} ${line.content}`;
  }
</script>

<div class="flex items-start gap-2 py-1" data-testid="assistant-proposal-hunk">
  <Switch.Root
    checked={selected}
    onCheckedChange={on_toggle}
    aria-label="Include hunk {hunk.header}"
    data-testid="assistant-proposal-hunk-toggle"
  />
  <div class="min-w-0 flex-1 overflow-x-auto font-mono text-xs">
    <p class="text-muted-foreground">{hunk.header}</p>
    {#each hunk.lines as line, index (index)}
      <span
        class="block whitespace-pre-wrap"
        class:text-chart-2={line.kind === "add"}
        class:text-destructive={line.kind === "del"}
        class:text-muted-foreground={line.kind === "context"}
        data-testid="assistant-proposal-line"
        data-kind={line.kind}>{line_text(line)}</span
      >
    {/each}
  </div>
</div>
