import {
  AMBIENT_RAIL_CARD_CAP,
  type AmbientNotice,
} from "$lib/features/assistant/types/ambient";

export type NoticePartition = {
  visible: AmbientNotice[];
  overflow_count: number;
};

// The mockup's "cards cap at N visible, the rest collapses into the margin
// count". Pure, so the cap rule is testable without a DOM and so the rail and
// any future surface cannot drift apart on what "overflow" means.
//
// Input order is preserved and never sorted: document order would require
// resolving every anchor against a live ProseMirror doc inside the one function
// whose whole value is not needing one.
export function partition_notices(
  notices: AmbientNotice[],
  cap: number = AMBIENT_RAIL_CARD_CAP,
): NoticePartition {
  return {
    visible: notices.slice(0, cap),
    overflow_count: Math.max(0, notices.length - cap),
  };
}
