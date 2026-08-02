import { describe, expect, it } from "vitest";
import {
  produce_ambient_notices,
  produce_orphan_note_notices,
  produce_stale_link_notices,
  type AmbientLinkFacts,
} from "$lib/features/assistant/domain/ambient_producers";

const NOW = 1_700_000_000_000;
const NOTE = "notes/ranking-experiments.md";

function facts(overrides: Partial<AmbientLinkFacts> = {}): AmbientLinkFacts {
  return {
    note_path: NOTE,
    backlinks: [],
    outlinks: [],
    orphan_links: [],
    ...overrides,
  };
}

describe("produce_stale_link_notices", () => {
  // C1 — `match` must be the RENDERED document text. The wiki-link plugin
  // replaces `[[fusion-weights]]` with a node whose text is `fusion-weights`,
  // so an anchor carrying the bracketed form would resolve to nothing.
  it("anchors on rendered display text, not source markdown", () => {
    const [notice] = produce_stale_link_notices(
      facts({
        orphan_links: [{ target_path: "fusion-weights", ref_count: 1 }],
      }),
      NOW,
    );

    expect(notice?.kind).toBe("stale_link");
    expect(notice?.note_path).toBe(NOTE);
    expect(notice?.anchor).toEqual({
      kind: "text",
      match: "fusion-weights",
      occurrence: 0,
    });
    expect(notice?.body).not.toContain("[[");
  });

  it("strips the .md extension the way the editor renders it", () => {
    const [notice] = produce_stale_link_notices(
      facts({ orphan_links: [{ target_path: "notes/gone.md", ref_count: 1 }] }),
      NOW,
    );

    expect(notice?.anchor).toMatchObject({ match: "notes/gone" });
  });

  it("renders a heading fragment the way the editor does", () => {
    const [notice] = produce_stale_link_notices(
      facts({ orphan_links: [{ target_path: "gone#Results", ref_count: 1 }] }),
      NOW,
    );

    expect(notice?.anchor).toMatchObject({ match: "gone > Results" });
  });

  // C2
  it("emits one notice per distinct broken target", () => {
    const notices = produce_stale_link_notices(
      facts({
        orphan_links: [
          { target_path: "a", ref_count: 1 },
          { target_path: "b", ref_count: 1 },
        ],
      }),
      NOW,
    );

    expect(notices.map((n) => n.anchor)).toEqual([
      { kind: "text", match: "a", occurrence: 0 },
      { kind: "text", match: "b", occurrence: 0 },
    ]);
  });

  // C3 — ref_count > 1 must not stack duplicate cards for one broken link.
  it("emits one notice for a target referenced many times", () => {
    const notices = produce_stale_link_notices(
      facts({ orphan_links: [{ target_path: "a", ref_count: 4 }] }),
      NOW,
    );

    expect(notices).toHaveLength(1);
    expect(notices[0]?.anchor).toMatchObject({ occurrence: 0 });
  });

  it("emits one notice when the same target appears twice in the snapshot", () => {
    const notices = produce_stale_link_notices(
      facts({
        orphan_links: [
          { target_path: "a", ref_count: 1 },
          { target_path: "a", ref_count: 1 },
        ],
      }),
      NOW,
    );

    expect(notices).toHaveLength(1);
  });

  // C4
  it("emits nothing when no links are broken", () => {
    expect(produce_stale_link_notices(facts(), NOW)).toEqual([]);
  });

  // C5 — offer-only: the offer proposes, it never mutates.
  it("offers the accept action, never a mutate verb", () => {
    const [notice] = produce_stale_link_notices(
      facts({ orphan_links: [{ target_path: "a", ref_count: 1 }] }),
      NOW,
    );

    expect(notice?.offer).toEqual({
      action_id: "assistant.accept_notice",
      label: "Remove link",
    });
  });

  // C6 — the producer owns its clock; the store is hydrate-shaped and has none.
  it("stamps created_at from the supplied clock", () => {
    const [notice] = produce_stale_link_notices(
      facts({ orphan_links: [{ target_path: "a", ref_count: 1 }] }),
      12_345,
    );

    expect(notice?.created_at).toBe(12_345);
  });

  // C7 — replace_for_note swaps the whole set, so a drifting id would re-key
  // every card on every scan.
  it("produces stable ids across rescans of identical input", () => {
    const once = produce_stale_link_notices(
      facts({ orphan_links: [{ target_path: "a", ref_count: 1 }] }),
      NOW,
    );
    const twice = produce_stale_link_notices(
      facts({ orphan_links: [{ target_path: "a", ref_count: 1 }] }),
      NOW + 5_000,
    );

    expect(once[0]?.id).toBe(twice[0]?.id);
  });

  it("gives different notes distinct ids for the same broken target", () => {
    const a = produce_stale_link_notices(
      facts({ orphan_links: [{ target_path: "x", ref_count: 1 }] }),
      NOW,
    );
    const b = produce_stale_link_notices(
      facts({
        note_path: "notes/other.md",
        orphan_links: [{ target_path: "x", ref_count: 1 }],
      }),
      NOW,
    );

    expect(a[0]?.id).not.toBe(b[0]?.id);
  });
});

describe("produce_orphan_note_notices", () => {
  // D1
  it("fires when nothing links in but the note links out", () => {
    const [notice] = produce_orphan_note_notices(
      facts({ outlinks: [{}] }),
      NOW,
    );

    expect(notice?.kind).toBe("orphan_note");
    expect(notice?.anchor).toEqual({ kind: "note" });
    expect(notice?.note_path).toBe(NOTE);
  });

  // D2 — the guard doubles as a brand-new/unindexed-note guard: such a note
  // has neither backlinks nor outlinks.
  it("stays silent for a note with no links at all", () => {
    expect(produce_orphan_note_notices(facts(), NOW)).toEqual([]);
  });

  // D3
  it("stays silent when something links in", () => {
    expect(
      produce_orphan_note_notices(
        facts({ backlinks: [{}], outlinks: [{}] }),
        NOW,
      ),
    ).toEqual([]);
  });

  // D4 — a whole-note property yields at most one card.
  it("emits at most one notice however many outlinks exist", () => {
    const notices = produce_orphan_note_notices(
      facts({ outlinks: [{}, {}, {}] }),
      NOW,
    );

    expect(notices).toHaveLength(1);
  });

  // The finding has no deterministic single-note repair, so its primary
  // action is the decline verb rather than a fabricated edit.
  it("offers a decline, not a propose", () => {
    const [notice] = produce_orphan_note_notices(
      facts({ outlinks: [{}] }),
      NOW,
    );

    expect(notice?.offer.action_id).toBe("assistant.dismiss_notice");
  });

  it("produces a stable id across rescans", () => {
    const once = produce_orphan_note_notices(facts({ outlinks: [{}] }), NOW);
    const twice = produce_orphan_note_notices(
      facts({ outlinks: [{}] }),
      NOW + 9,
    );

    expect(once[0]?.id).toBe(twice[0]?.id);
  });
});

describe("produce_ambient_notices", () => {
  // D5 — both producers are fed by ONE snapshot; this is what removes the
  // vault-graph dependency the plan assumed was necessary.
  it("returns both kinds from a single snapshot", () => {
    const notices = produce_ambient_notices(
      facts({
        outlinks: [{}],
        orphan_links: [{ target_path: "gone", ref_count: 1 }],
      }),
      NOW,
    );

    expect(notices.map((n) => n.kind)).toEqual(["stale_link", "orphan_note"]);
  });

  it("returns nothing for a well-linked note", () => {
    expect(
      produce_ambient_notices(facts({ backlinks: [{}], outlinks: [{}] }), NOW),
    ).toEqual([]);
  });

  it("never emits a notice whose offer could write a note directly", () => {
    const notices = produce_ambient_notices(
      facts({
        outlinks: [{}],
        orphan_links: [{ target_path: "gone", ref_count: 1 }],
      }),
      NOW,
    );

    for (const notice of notices) {
      expect(["assistant.accept_notice", "assistant.dismiss_notice"]).toContain(
        notice.offer.action_id,
      );
    }
  });
});
