import { describe, expect, it } from "vitest";
import {
  AMBIENT_RAIL_CARD_CAP,
  partition_notices,
} from "$lib/features/assistant";
import {
  make_ambient_notice,
  make_ambient_notices,
} from "../helpers/assistant_notice_fixtures";

describe("partition_notices", () => {
  it("returns nothing visible and no overflow for an empty queue", () => {
    expect(partition_notices([])).toEqual({ visible: [], overflow_count: 0 });
  });

  it("shows every notice when the queue is below the cap", () => {
    const notices = make_ambient_notices(2);

    const partition = partition_notices(notices);

    expect(partition.visible).toEqual(notices);
    expect(partition.overflow_count).toBe(0);
  });

  it("shows every notice when the queue is exactly at the cap", () => {
    const notices = make_ambient_notices(AMBIENT_RAIL_CARD_CAP);

    const partition = partition_notices(notices);

    expect(partition.visible).toHaveLength(AMBIENT_RAIL_CARD_CAP);
    expect(partition.overflow_count).toBe(0);
  });

  it("collapses the excess into a count once the queue passes the cap", () => {
    const notices = make_ambient_notices(AMBIENT_RAIL_CARD_CAP + 1);

    const partition = partition_notices(notices);

    expect(partition.visible).toHaveLength(AMBIENT_RAIL_CARD_CAP);
    expect(partition.overflow_count).toBe(1);
  });

  it("counts every notice past the cap, not just the first", () => {
    const partition = partition_notices(make_ambient_notices(7));

    expect(partition.overflow_count).toBe(7 - AMBIENT_RAIL_CARD_CAP);
  });

  it("keeps input order and never sorts", () => {
    const oldest = make_ambient_notice({ id: "c", created_at: 3 });
    const newest = make_ambient_notice({ id: "a", created_at: 1 });
    const middle = make_ambient_notice({ id: "b", created_at: 2 });

    const partition = partition_notices([oldest, newest, middle]);

    expect(partition.visible.map((notice) => notice.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("does not mutate the queue it was given", () => {
    const notices = make_ambient_notices(5);
    const before = [...notices];

    partition_notices(notices);

    expect(notices).toEqual(before);
  });

  it("honours an explicit cap over the default", () => {
    const partition = partition_notices(make_ambient_notices(5), 2);

    expect(partition.visible).toHaveLength(2);
    expect(partition.overflow_count).toBe(3);
  });

  it("shows nothing and overflows everything at a cap of zero", () => {
    const partition = partition_notices(make_ambient_notices(4), 0);

    expect(partition.visible).toEqual([]);
    expect(partition.overflow_count).toBe(4);
  });

  it("defaults to the contract's cap rather than a hardcoded number", () => {
    const notices = make_ambient_notices(AMBIENT_RAIL_CARD_CAP + 2);

    expect(partition_notices(notices)).toEqual(
      partition_notices(notices, AMBIENT_RAIL_CARD_CAP),
    );
  });
});
