<script lang="ts">
  import { ChevronDown, ChevronRight } from "@lucide/svelte";
  import AssistantProposalHunk from "./assistant_proposal_hunk.svelte";
  import type {
    Proposal,
    ProposalHunkId,
    ProposalId,
  } from "$lib/features/assistant/types/proposal";

  interface Props {
    proposal: Proposal;
    on_accept_all: (id: ProposalId) => void;
    on_reject: (id: ProposalId) => void;
    on_toggle_hunk: (
      id: ProposalId,
      hunk_id: ProposalHunkId,
      selected: boolean,
    ) => void;
  }

  let { proposal, on_accept_all, on_reject, on_toggle_hunk }: Props = $props();

  // Collapsed by default: the review center is a list of proposals, unlike
  // the panel's single-card mockup context, so showing every diff at once
  // would bury the provenance groups this tab exists to surface.
  let expanded = $state(false);

  const selected_count = $derived(
    proposal.hunks.filter((hunk) => hunk.selected).length,
  );
</script>

<div
  class="rounded-md border p-3"
  data-testid="assistant-proposal-card"
  data-proposal-id={proposal.id}
>
  <div class="flex flex-wrap items-center gap-2 text-xs">
    <span
      class="rounded bg-accent px-1.5 py-0.5 font-medium text-accent-foreground"
      >Proposal</span
    >
    <span data-testid="assistant-proposal-note-path"
      >{proposal.note_path} · {proposal.hunks.length}
      {proposal.hunks.length === 1 ? "hunk" : "hunks"}</span
    >
    <span
      class="text-muted-foreground"
      data-testid="assistant-proposal-selected"
      >{selected_count} of {proposal.hunks.length} selected</span
    >
  </div>

  <button
    type="button"
    class="mt-2 flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    data-testid="assistant-proposal-review-hunks"
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    {#if expanded}
      <ChevronDown class="size-3.5 shrink-0" />
    {:else}
      <ChevronRight class="size-3.5 shrink-0" />
    {/if}
    Review hunks
  </button>

  {#if expanded}
    <div
      class="mt-1 flex flex-col divide-y"
      data-testid="assistant-proposal-diff"
    >
      {#each proposal.hunks as hunk (hunk.id)}
        <AssistantProposalHunk
          {hunk}
          on_toggle={(selected) =>
            on_toggle_hunk(proposal.id, hunk.id, selected)}
        />
      {/each}
    </div>
  {/if}

  <div class="mt-3 flex items-center gap-2">
    <button
      type="button"
      class="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      data-testid="assistant-proposal-accept-all"
      onclick={() => on_accept_all(proposal.id)}
    >
      Accept all
    </button>
    <button
      type="button"
      class="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-destructive"
      data-testid="assistant-proposal-reject"
      onclick={() => on_reject(proposal.id)}
    >
      Reject
    </button>
  </div>
</div>
