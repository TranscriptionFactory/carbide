<script lang="ts">
  import type {
    AmbientNotice,
    AmbientNoticeId,
  } from "$lib/features/assistant/types/ambient";

  interface Props {
    notice: AmbientNotice;
    on_offer: (notice: AmbientNotice) => void;
    on_dismiss: (id: AmbientNoticeId) => void;
  }

  let { notice, on_offer, on_dismiss }: Props = $props();
</script>

<!-- Offer-only (I6): at most one primary and always one ghost, and the ghost is
     always dismissive. The primary's label comes from the offer because it is
     not always an "apply" — the mockup's second card offers a navigation. A
     null offer renders no primary at all: a finding with no deterministic
     repair states itself and leaves, rather than dressing the implicit dismiss
     up as a second button. -->
<div
  class="rounded-md border p-3"
  data-testid="assistant-notice-card"
  data-notice-id={notice.id}
>
  <div
    class="text-[10px] uppercase tracking-wider text-muted-foreground"
    data-testid="assistant-notice-provenance"
  >
    {notice.provenance}
  </div>

  <p
    class="mt-1 text-xs text-muted-foreground"
    data-testid="assistant-notice-body"
  >
    {notice.body}
  </p>

  <div class="mt-3 flex items-center gap-2">
    {#if notice.offer}
      <button
        type="button"
        class="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        data-testid="assistant-notice-offer"
        onclick={() => on_offer(notice)}
      >
        {notice.offer.label}
      </button>
    {/if}
    <button
      type="button"
      class="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      data-testid="assistant-notice-dismiss"
      onclick={() => on_dismiss(notice.id)}
    >
      Dismiss
    </button>
  </div>
</div>
