<script lang="ts">
  import { Loader2 } from "@lucide/svelte";
  import { format_wait_elapsed } from "$lib/features/assistant/domain/format_wait_elapsed";

  const {
    stage,
    provider_name,
  }: { stage: "searching" | "generating"; provider_name: string } = $props();

  let elapsed_ms = $state(0);

  // Mount-scoped, so the counter reports the whole wait rather than restarting
  // when retrieval hands over to generation.
  $effect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      elapsed_ms = Date.now() - started;
    }, 1000);
    return () => clearInterval(timer);
  });
</script>

<div
  class="flex items-center gap-2 text-sm text-muted-foreground"
  data-testid="chat-wait-indicator"
>
  <Loader2 class="size-4 animate-spin" />
  {stage === "generating"
    ? `Waiting for ${provider_name}…`
    : "Searching your vault…"}
  <span class="text-xs tabular-nums">{format_wait_elapsed(elapsed_ms)}</span>
</div>
