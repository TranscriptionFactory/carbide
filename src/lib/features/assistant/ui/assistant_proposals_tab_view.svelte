<script lang="ts">
  import Inbox from "@lucide/svelte/icons/inbox";
  import EmptyMessage from "$lib/components/ui/empty_message.svelte";
  import AssistantProposalCard from "./assistant_proposal_card.svelte";
  import type {
    Proposal,
    ProposalHunkId,
    ProposalId,
  } from "$lib/features/assistant/types/proposal";
  import { KIND_GLYPHS } from "$lib/features/assistant/domain/kind_glyphs";
  import { group_proposals_by_day } from "$lib/features/assistant/domain/proposal_day_groups";
  import type { AssistantSessionSummary } from "$lib/features/assistant/types/session";

  interface Props {
    proposals: Proposal[];
    session_summaries: AssistantSessionSummary[];
    on_accept_proposal: (id: ProposalId) => void;
    on_accept_all_pending: (ids: ProposalId[]) => void;
    on_reject_proposal: (id: ProposalId) => void;
    on_toggle_hunk: (
      id: ProposalId,
      hunk_id: ProposalHunkId,
      selected: boolean,
    ) => void;
    now?: () => number;
  }

  let {
    proposals,
    session_summaries,
    on_accept_proposal,
    on_accept_all_pending,
    on_reject_proposal,
    on_toggle_hunk,
    now = () => Date.now(),
  }: Props = $props();

  const session_by_id = $derived(
    new Map(session_summaries.map((session) => [session.id, session])),
  );

  // Day OUTER (Today/Yesterday/absolute), provenance INNER (mockup §3).
  // Ordering lives in the domain: hydration makes the store's insertion
  // order an artifact of file order.
  const day_groups = $derived(group_proposals_by_day(proposals, now()));
</script>

<div class="flex flex-col gap-4 p-4" data-testid="assistant-proposals-tab">
  <div class="flex items-center justify-between">
    <h1 class="text-sm font-semibold">Proposals</h1>
    {#if proposals.length > 0}
      <button
        type="button"
        class="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        data-testid="assistant-proposals-accept-all-pending"
        onclick={() => on_accept_all_pending(proposals.map((p) => p.id))}
      >
        Accept all pending
      </button>
    {/if}
  </div>

  {#if proposals.length === 0}
    <EmptyMessage
      icon={Inbox}
      text="No pending proposals"
      hint="AI-drafted note edits will appear here for review before they apply."
    />
  {:else}
    {#each day_groups as day (day.key)}
      <div
        class="flex flex-col gap-3"
        data-testid="assistant-proposal-day-group"
      >
        <h2
          class="text-xs font-medium text-muted-foreground"
          data-testid="assistant-proposal-day-label"
        >
          {day.label}
        </h2>
        {#each day.groups as group (group.session_id)}
          {@const session = session_by_id.get(group.session_id) ?? null}
          <div
            class="flex flex-col gap-2"
            data-testid="assistant-proposal-group"
          >
            <p
              class="text-xs text-muted-foreground"
              data-testid="assistant-proposal-group-provenance"
            >
              from {session
                ? `${KIND_GLYPHS[session.kind]} ${session.title}`
                : group.session_id}
            </p>
            {#each group.proposals as proposal (proposal.id)}
              <AssistantProposalCard
                {proposal}
                on_accept_all={on_accept_proposal}
                on_reject={on_reject_proposal}
                {on_toggle_hunk}
              />
            {/each}
          </div>
        {/each}
      </div>
    {/each}
  {/if}
</div>
