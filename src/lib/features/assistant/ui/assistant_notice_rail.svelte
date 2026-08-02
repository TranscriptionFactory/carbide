<script lang="ts">
  import type {
    AmbientNotice,
    AmbientNoticeId,
  } from "$lib/features/assistant/types/ambient";
  import { partition_notices } from "$lib/features/assistant/domain/partition_notices";
  import AssistantNoticeCard from "./assistant_notice_card.svelte";

  interface Props {
    notices: AmbientNotice[];
    on_offer: (notice: AmbientNotice) => void;
    on_dismiss: (id: AmbientNoticeId) => void;
  }

  let { notices, on_offer, on_dismiss }: Props = $props();

  const partition = $derived(partition_notices(notices));
</script>

{#if notices.length > 0}
  <aside class="AssistantNoticeRail" data-testid="assistant-notice-rail">
    {#each partition.visible as notice (notice.id)}
      <AssistantNoticeCard {notice} {on_offer} {on_dismiss} />
    {/each}
    {#if partition.overflow_count > 0}
      <div
        class="text-[10px] text-muted-foreground"
        data-testid="assistant-notice-overflow"
      >
        +{partition.overflow_count}
      </div>
    {/if}
  </aside>
{/if}

<style>
  /* Sticky rather than measured: the cards are not y-aligned to their anchor
     blocks, so the rail needs none of the drag handle's rAF machinery. */
  .AssistantNoticeRail {
    position: sticky;
    top: 0;
    align-self: flex-start;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: var(--ambient-rail-width, 16.5rem);
    flex-shrink: 0;
    padding: var(--space-5) var(--space-3);
    border-left: 1px solid var(--border);
    background-color: var(--background);
  }
</style>
