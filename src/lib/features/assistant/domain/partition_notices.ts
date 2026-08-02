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
export function partition_notices(
  _notices: AmbientNotice[],
  _cap: number = AMBIENT_RAIL_CARD_CAP,
): NoticePartition {
  throw new Error("NOT_IMPLEMENTED: AU-061");
}
