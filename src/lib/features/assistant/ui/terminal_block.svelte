<script lang="ts">
  import { render_terminal_text } from "$lib/features/assistant/domain/terminal_text";

  type Props = {
    text: string;
  };

  let { text }: Props = $props();

  const rendered = $derived(render_terminal_text(text));
</script>

<div class="min-w-0" data-testid="terminal-block">
  <pre
    class="overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/50 px-2 py-1 font-mono text-[11px] text-foreground"
    data-testid="terminal-block-output">{rendered}</pre>
</div>
