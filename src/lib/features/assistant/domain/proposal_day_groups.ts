import { day_label } from "$lib/shared/utils/day_label";
import type { Proposal } from "$lib/features/assistant/types/proposal";

export type ProposalProvenanceGroup = {
  session_id: string;
  proposals: Proposal[];
};

export type ProposalDayGroup = {
  // Today / Yesterday / an absolute date (shared day_label, as in
  // checkpoint_history).
  label: string;
  // toDateString of the day — stable render key independent of the label.
  key: string;
  groups: ProposalProvenanceGroup[];
};

// Day OUTER, provenance INNER (mockup §3). Ordering is explicit created_at
// desc: hydration makes first-appearance order an artifact of file order, so
// the store's insertion order can no longer be trusted to mean anything.
export function group_proposals_by_day(
  proposals: readonly Proposal[],
  now_ms: number,
): ProposalDayGroup[] {
  const sorted = [...proposals].sort((a, b) => b.created_at - a.created_at);

  const days: ProposalDayGroup[] = [];
  for (const proposal of sorted) {
    const date = new Date(proposal.created_at);
    const key = date.toDateString();

    let day = days.at(-1);
    if (!day || day.key !== key) {
      day = { label: day_label(date, now_ms), key, groups: [] };
      days.push(day);
    }

    const session_id = proposal.origin.session_id;
    const group = day.groups.find((g) => g.session_id === session_id);
    if (group) {
      group.proposals.push(proposal);
    } else {
      day.groups.push({ session_id, proposals: [proposal] });
    }
  }

  return days;
}
