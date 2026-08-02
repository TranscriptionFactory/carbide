import { format_wiki_target_display } from "$lib/features/editor";
import type { AmbientNotice } from "$lib/features/assistant/types/ambient";

// Mirrors `wiki_link_plugin`'s own regex and display rule exactly, so what this
// rewrites is precisely what the editor rendered — group 1 is the target,
// group 2 the optional alias, and the displayed text is the alias when present.
const WIKI_LINK_RE = /\[\[([^\]\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

// I6: this derives the DRAFT TEXT of a proposal, never a write. The caller
// turns it into a Proposal that still needs its own accept in the review
// centre — two explicit user acts, by construction.
//
// Returns null when no edit is derivable, and the caller must then enqueue
// nothing. A notice kind with no deterministic single-note repair (orphan_note)
// takes that path by design rather than fabricating a change.
export function build_notice_draft_text(
  notice: AmbientNotice,
  markdown: string,
): string | null {
  if (notice.kind !== "stale_link") return null;
  if (notice.anchor.kind !== "text") return null;

  const target_display = notice.anchor.match;
  let changed = false;

  const draft = markdown.replace(
    WIKI_LINK_RE,
    (whole: string, raw: string, alias: string | undefined) => {
      const display = alias || format_wiki_target_display(raw);
      if (display !== target_display) return whole;
      changed = true;
      return display;
    },
  );

  return changed ? draft : null;
}
