<script lang="ts">
  import Inbox from "@lucide/svelte/icons/inbox";
  import EmptyMessage from "$lib/components/ui/empty_message.svelte";
  import AssistantProposalCard from "./assistant_proposal_card.svelte";
  import type {
    Proposal,
    ProposalHunkId,
    ProposalId,
  } from "$lib/features/assistant/types/proposal";
  import type {
    AssistantSessionKind,
    AssistantSessionSummary,
  } from "$lib/features/assistant/types/session";

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
  }

  let {
    proposals,
    session_summaries,
    on_accept_proposal,
    on_accept_all_pending,
    on_reject_proposal,
    on_toggle_hunk,
  }: Props = $props();

  const KIND_GLYPHS: Record<AssistantSessionKind, string> = {
    inline: "⌁",
    note: "▤",
    chat: "◈",
  };

  const session_by_id = $derived(
    new Map(session_summaries.map((session) => [session.id, session])),
  );

  // Provenance groups in first-appearance order — the store exposes no sort,
  // and this keeps the group a proposal's session produces first at the top
  // rather than reshuffling as new sessions' proposals arrive.
  const groups = $derived.by(() => {
    const order: string[] = [];
    const by_session = new Map<string, Proposal[]>();
    for (const proposal of proposals) {
      const session_id = proposal.origin.session_id;
      const existing = by_session.get(session_id);
      if (existing) {
        existing.push(proposal);
      } else {
        by_session.set(session_id, [proposal]);
        order.push(session_id);
      }
    }
    return order.map((session_id) => ({
      session_id,
      session: session_by_id.get(session_id) ?? null,
      proposals: by_session.get(session_id) ?? [],
    }));
  });
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
    {#each groups as group (group.session_id)}
      <div class="flex flex-col gap-2" data-testid="assistant-proposal-group">
        <p
          class="text-xs text-muted-foreground"
          data-testid="assistant-proposal-group-provenance"
        >
          from {group.session
            ? `${KIND_GLYPHS[group.session.kind]} ${group.session.title}`
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
  {/if}
</div>
