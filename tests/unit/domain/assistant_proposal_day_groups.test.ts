import { describe, expect, it } from "vitest";
import { group_proposals_by_day } from "$lib/features/assistant";
import { make_proposal } from "../helpers/assistant_proposal_fixtures";

// Pinned local noon so day boundaries sit hours away in either direction.
const NOON = new Date(2026, 7, 3, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

describe("group_proposals_by_day", () => {
  it("labels the pinned now's day Today and the previous day Yesterday", () => {
    const groups = group_proposals_by_day(
      [
        make_proposal({ id: "t", created_at: NOON - 1000 }),
        make_proposal({ id: "y", created_at: NOON - DAY }),
      ],
      NOON,
    );

    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"]);
  });

  it("labels older days with an absolute date", () => {
    const old = new Date(2026, 6, 20, 9, 0, 0).getTime();
    const groups = group_proposals_by_day(
      [make_proposal({ created_at: old })],
      NOON,
    );

    expect(groups[0]?.label).toBe(
      new Date(old).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    );
  });

  it("splits proposals across a midnight boundary into two day groups", () => {
    const just_before_midnight = new Date(2026, 7, 2, 23, 59, 0).getTime();
    const just_after_midnight = new Date(2026, 7, 3, 0, 1, 0).getTime();
    const groups = group_proposals_by_day(
      [
        make_proposal({ id: "late", created_at: just_before_midnight }),
        make_proposal({ id: "early", created_at: just_after_midnight }),
      ],
      NOON,
    );

    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"]);
    expect(groups[0]?.groups[0]?.proposals[0]?.id).toBe("early");
    expect(groups[1]?.groups[0]?.proposals[0]?.id).toBe("late");
  });

  it("orders by created_at desc regardless of input order (hydration makes file order meaningless)", () => {
    const groups = group_proposals_by_day(
      [
        make_proposal({ id: "old", created_at: NOON - 2 * DAY }),
        make_proposal({ id: "new", created_at: NOON - 1000 }),
        make_proposal({ id: "mid", created_at: NOON - DAY }),
      ],
      NOON,
    );

    expect(
      groups
        .flatMap((g) => g.groups.flatMap((p) => p.proposals))
        .map((p) => p.id),
    ).toEqual(["new", "mid", "old"]);
  });

  it("groups by provenance INSIDE a day, first-appearance order of the sorted stream", () => {
    const groups = group_proposals_by_day(
      [
        make_proposal({
          id: "a1",
          created_at: NOON - 1000,
          origin: { session_id: "A", run_id: null },
        }),
        make_proposal({
          id: "b1",
          created_at: NOON - 2000,
          origin: { session_id: "B", run_id: null },
        }),
        make_proposal({
          id: "a2",
          created_at: NOON - 3000,
          origin: { session_id: "A", run_id: null },
        }),
      ],
      NOON,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.groups.map((g) => g.session_id)).toEqual(["A", "B"]);
    expect(groups[0]?.groups[0]?.proposals.map((p) => p.id)).toEqual([
      "a1",
      "a2",
    ]);
  });

  it("repeats a session's group in each day it produced proposals", () => {
    const groups = group_proposals_by_day(
      [
        make_proposal({
          id: "today",
          created_at: NOON - 1000,
          origin: { session_id: "A", run_id: null },
        }),
        make_proposal({
          id: "yesterday",
          created_at: NOON - DAY,
          origin: { session_id: "A", run_id: null },
        }),
      ],
      NOON,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.groups[0]?.session_id).toBe("A");
    expect(groups[1]?.groups[0]?.session_id).toBe("A");
  });

  it("returns no groups for no proposals", () => {
    expect(group_proposals_by_day([], NOON)).toEqual([]);
  });
});
