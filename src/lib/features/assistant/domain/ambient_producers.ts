import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { format_wiki_target_display } from "$lib/features/editor";
import type { AmbientNotice } from "$lib/features/assistant/types/ambient";

// R5's deterministic producers. Both read ONE `NoteLinksSnapshot` — the single
// per-note indexed query `index_note_links_snapshot`, which returns backlinks,
// outlinks and orphan_links together. `orphan_note` deliberately does NOT go
// near the vault graph: `GraphPort` exposes no way to read a warm cache without
// risking a full-vault rebuild, and it does not need one.
//
// Structurally typed rather than importing `NoteLinksSnapshot` so the producers
// stay pure domain with no dependency on the search feature. Only lengths are
// needed from backlinks/outlinks, so their element type is irrelevant here.
export type AmbientLinkFacts = {
  note_path: string;
  backlinks: readonly unknown[];
  outlinks: readonly unknown[];
  orphan_links: readonly { target_path: string }[];
};

const PROVENANCE = "ambient · link check";

// Stable per (kind, note, target) so a rescan of unchanged content produces
// identical ids. `replace_for_note` swaps the whole set, so a drifting id would
// re-key every card on every scan and make the rail flicker.
function notice_id(
  kind: string,
  note_path: string,
  discriminator = "",
): string {
  return discriminator
    ? `${kind}:${note_path}:${discriminator}`
    : `${kind}:${note_path}`;
}

// An outlink whose target has no row in `notes`. The anchor's `match` is the
// text AS RENDERED: the wiki-link plugin replaces the literal `[[target]]` with
// a link-marked node whose text is `format_wiki_target_display(target)`, so an
// anchor carrying the bracketed form resolves to nothing in the visual editor.
//
// One notice per target, not per occurrence: `ref_count` may exceed 1 and the
// rail would otherwise stack duplicate cards for the same broken link.
export function produce_stale_link_notices(
  facts: AmbientLinkFacts,
  now: number,
): AmbientNotice[] {
  const seen = new Set<string>();
  const notices: AmbientNotice[] = [];

  for (const link of facts.orphan_links) {
    if (seen.has(link.target_path)) continue;
    seen.add(link.target_path);

    const display = format_wiki_target_display(link.target_path);
    notices.push({
      id: notice_id("stale_link", facts.note_path, link.target_path),
      kind: "stale_link",
      note_path: facts.note_path,
      anchor: { kind: "text", match: display, occurrence: 0 },
      provenance: PROVENANCE,
      body: `This note links to ${display}, which no longer exists. Remove the link?`,
      offer: {
        action_id: ACTION_IDS.assistant_accept_notice,
        label: "Remove link",
      },
      created_at: now,
    });
  }

  return notices;
}

// A note with zero INBOUND links — the opposite direction from the tree's
// `orphan_links` / `orphan_count` / graph `kind: "orphan"`, which all mean a
// broken OUTLINK.
//
// Guarded on having at least one outlink. A brand-new or not-yet-indexed note
// has neither backlinks nor outlinks, so the same guard suppresses that entire
// false-positive class with no extra query.
//
// The offer is a DECLINE, not a propose. This finding has no deterministic
// single-note repair, and the contract allows exactly two verbs — a notice
// "can decline, and it can propose, and it has no third verb". Fabricating a
// link into some other note to clear the finding would be inventing an edit the
// evidence does not support; acknowledging is the honest primary action.
export function produce_orphan_note_notices(
  facts: AmbientLinkFacts,
  now: number,
): AmbientNotice[] {
  if (facts.backlinks.length > 0) return [];
  if (facts.outlinks.length === 0) return [];

  return [
    {
      id: notice_id("orphan_note", facts.note_path),
      kind: "orphan_note",
      note_path: facts.note_path,
      anchor: { kind: "note" },
      provenance: PROVENANCE,
      body: "Nothing links to this note yet.",
      offer: {
        action_id: ACTION_IDS.assistant_dismiss_notice,
        label: "Got it",
      },
      created_at: now,
    },
  ];
}

export function produce_ambient_notices(
  facts: AmbientLinkFacts,
  now: number,
): AmbientNotice[] {
  return [
    ...produce_stale_link_notices(facts, now),
    ...produce_orphan_note_notices(facts, now),
  ];
}
