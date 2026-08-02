import { describe, expect, it } from "vitest";
import { AssistantNoticeStore } from "$lib/features/assistant";
import { make_ambient_notice } from "../../../helpers/assistant_notice_fixtures";

const A = "notes/a.md";
const B = "notes/b.md";

function store_with(...notices: ReturnType<typeof make_ambient_notice>[]) {
  const store = new AssistantNoticeStore();
  for (const notice of notices) {
    store.replace_for_note(notice.note_path, [
      ...store.for_note(notice.note_path),
      notice,
    ]);
  }
  return store;
}

describe("AssistantNoticeStore mutators", () => {
  // E1
  it("replaces one note's set and leaves other notes untouched", () => {
    const store = store_with(
      make_ambient_notice({ note_path: A }),
      make_ambient_notice({ note_path: B }),
    );
    const replacement = make_ambient_notice({ note_path: A });

    store.replace_for_note(A, [replacement]);

    expect(store.for_note(A).map((n) => n.id)).toEqual([replacement.id]);
    expect(store.for_note(B)).toHaveLength(1);
  });

  // E2
  it("removes a note's notices when replaced with an empty set", () => {
    const store = store_with(make_ambient_notice({ note_path: A }));

    store.replace_for_note(A, []);

    expect(store.for_note(A)).toEqual([]);
    expect(store.count).toBe(0);
  });

  // E3 — the producers recompute from scratch, so a merge would strand
  // findings the source no longer reports.
  it("does not merge: a finding the source dropped disappears", () => {
    const stale = make_ambient_notice({ note_path: A });
    const store = store_with(stale);
    const fresh = make_ambient_notice({ note_path: A });

    store.replace_for_note(A, [fresh]);

    expect(store.get(stale.id)).toBeNull();
    expect(store.get(fresh.id)).not.toBeNull();
  });

  // E4
  it("dismisses exactly one notice", () => {
    const first = make_ambient_notice({ note_path: A });
    const second = make_ambient_notice({ note_path: A });
    const store = store_with(first, second);

    store.dismiss(first.id);

    expect(store.for_note(A).map((n) => n.id)).toEqual([second.id]);
  });

  it("ignores a dismiss for an unknown id", () => {
    const store = store_with(make_ambient_notice({ note_path: A }));

    store.dismiss("no-such-notice");

    expect(store.count).toBe(1);
  });

  // E5
  it("clears everything", () => {
    const store = store_with(
      make_ambient_notice({ note_path: A }),
      make_ambient_notice({ note_path: B }),
    );

    store.clear();

    expect(store.notices).toEqual([]);
    expect(store.count).toBe(0);
  });

  // E6
  it("reports count and per-note reads after mutation", () => {
    const store = new AssistantNoticeStore();
    expect(store.count).toBe(0);

    store.replace_for_note(A, [
      make_ambient_notice({ note_path: A }),
      make_ambient_notice({ note_path: A }),
    ]);

    expect(store.count).toBe(2);
    expect(store.for_note(B)).toEqual([]);
  });

  // E7 — AU-061's rail renders from `$state`; an in-place mutation would not
  // propagate.
  it("produces a new array reference on every mutation", () => {
    const store = new AssistantNoticeStore();
    const empty = store.notices;

    store.replace_for_note(A, [make_ambient_notice({ note_path: A })]);
    const after_replace = store.notices;
    expect(after_replace).not.toBe(empty);

    store.dismiss(after_replace[0]?.id ?? "");
    expect(store.notices).not.toBe(after_replace);

    const before_clear = store.notices;
    store.clear();
    expect(store.notices).not.toBe(before_clear);
  });
});
