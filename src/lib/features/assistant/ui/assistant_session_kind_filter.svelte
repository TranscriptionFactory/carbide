<script lang="ts">
  import type { AssistantSessionKind } from "$lib/features/assistant/types/session";

  interface Props {
    selected: AssistantSessionKind | "all";
    on_select: (kind: AssistantSessionKind | "all") => void;
  }

  let { selected, on_select }: Props = $props();

  const CHIPS: { kind: AssistantSessionKind | "all"; label: string }[] = [
    { kind: "all", label: "All" },
    { kind: "inline", label: "⌁ Inline" },
    { kind: "note", label: "▤ Note" },
    { kind: "chat", label: "◈ Chat" },
  ];
</script>

<div class="flex flex-wrap gap-1.5 px-3 py-2">
  {#each CHIPS as chip (chip.kind)}
    <button
      type="button"
      class="rounded-full border px-2 py-0.5 text-xs transition-colors {chip.kind ===
      selected
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
      data-testid="assistant-session-filter"
      data-kind={chip.kind}
      aria-pressed={chip.kind === selected}
      onclick={() => {
        on_select(chip.kind);
      }}
    >
      {chip.label}
    </button>
  {/each}
</div>
