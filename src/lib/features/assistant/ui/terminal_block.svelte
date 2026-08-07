<script lang="ts">
  import { render_terminal_text } from "$lib/features/assistant/domain/terminal_text";

  type Props = {
    text: string;
    exit_code?: number | null;
    truncated?: boolean;
  };

  let { text, exit_code = null, truncated = false }: Props = $props();

  const rendered = $derived(render_terminal_text(text));
  const exit_badge = $derived(
    typeof exit_code === "number" && exit_code !== 0
      ? `exit ${String(exit_code)}`
      : null,
  );
</script>

<div class="min-w-0" data-testid="terminal-block">
  {#if exit_badge !== null}
    <span
      class="mb-1 inline-flex items-center rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-[10px] text-destructive"
      data-testid="terminal-block-exit">{exit_badge}</span
    >
  {/if}
  <pre
    class="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/50 px-2 py-1 font-mono text-[11px] text-foreground"
    data-testid="terminal-block-output">{#if truncated}<span
        class="block text-muted-foreground"
        data-testid="terminal-block-trimmed">… output trimmed</span
      >{/if}{rendered}</pre>
</div>
