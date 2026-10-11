<script lang="ts">
  import { Check, Copy } from "@lucide/svelte";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";

  let { detail }: { detail: string } = $props();

  const { action_registry } = use_app_context();

  let copied = $state(false);

  async function copy_detail() {
    await action_registry.execute(ACTION_IDS.rag_copy_error_detail, detail);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<details class="text-xs" data-testid="chat-error-detail">
  <summary class="cursor-pointer select-none text-muted-foreground">
    Details
  </summary>
  <div class="mt-1 flex items-start gap-1">
    <pre
      class="max-h-48 min-w-0 flex-1 select-text overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-muted-foreground">{detail}</pre>
    <button
      type="button"
      class="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      onclick={copy_detail}
      title={copied ? "Copied" : "Copy details"}
      aria-label="Copy error details"
    >
      {#if copied}
        <Check class="size-3.5" />
      {:else}
        <Copy class="size-3.5" />
      {/if}
    </button>
  </div>
</details>
