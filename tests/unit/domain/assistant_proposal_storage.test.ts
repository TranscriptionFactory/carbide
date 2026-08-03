import { describe, expect, it } from "vitest";
import {
  parse_stored,
  to_stored,
  PROPOSAL_STORAGE_CAP,
  PROPOSAL_STORAGE_VERSION,
} from "$lib/features/assistant";
import { make_proposal } from "../helpers/assistant_proposal_fixtures";

const SAVED_AT = 1_700_000_100_000;

describe("to_stored", () => {
  it("writes only pending proposals with the current version", () => {
    const pending = make_proposal({ status: "pending" });
    const stored = to_stored(
      [
        pending,
        make_proposal({ status: "applied" }),
        make_proposal({ status: "rejected" }),
        make_proposal({ status: "stale" }),
      ],
      SAVED_AT,
    );

    expect(stored.version).toBe(PROPOSAL_STORAGE_VERSION);
    expect(stored.saved_at).toBe(SAVED_AT);
    expect(stored.proposals).toEqual([pending]);
  });

  it("caps at the storage limit, keeping the newest first", () => {
    const proposals = Array.from({ length: PROPOSAL_STORAGE_CAP + 5 }, (_, i) =>
      make_proposal({ id: `p-${String(i)}`, created_at: i }),
    );

    const stored = to_stored(proposals, SAVED_AT);

    expect(stored.proposals).toHaveLength(PROPOSAL_STORAGE_CAP);
    expect((stored.proposals[0] as { id: string }).id).toBe(
      `p-${String(PROPOSAL_STORAGE_CAP + 4)}`,
    );
  });
});

describe("parse_stored", () => {
  it("round-trips a pending proposal verbatim", () => {
    const proposal = make_proposal();

    const parsed = parse_stored(
      JSON.parse(JSON.stringify(to_stored([proposal], SAVED_AT))),
    );

    expect(parsed).toEqual([proposal]);
  });

  it("preserves unknown fields written by a newer version", () => {
    const proposal = make_proposal();
    const stored = to_stored([proposal], SAVED_AT);
    const with_extra = {
      ...stored,
      proposals: [
        { ...(stored.proposals[0] as object), future_field: "keep me" },
      ],
    };

    const parsed = parse_stored(JSON.parse(JSON.stringify(with_extra)));

    expect(parsed[0]).toMatchObject({ future_field: "keep me" });
  });

  it("still reads a file with a NEWER version — refusing would let a downgrade destroy the queue", () => {
    const stored = to_stored([make_proposal()], SAVED_AT);

    const parsed = parse_stored({ ...stored, version: 2 });

    expect(parsed).toHaveLength(1);
  });

  it("drops an invalid entry alone, keeping its valid neighbours", () => {
    const good = make_proposal();
    const stored = to_stored([good], SAVED_AT);

    const parsed = parse_stored({
      ...stored,
      proposals: [{ id: "broken" }, stored.proposals[0], null, "not an object"],
    });

    expect(parsed).toEqual([good]);
  });

  it("drops non-pending entries on read — terminal statuses never resurrect", () => {
    const stored = to_stored([make_proposal()], SAVED_AT);
    const applied = { ...(stored.proposals[0] as object), status: "applied" };

    expect(parse_stored({ ...stored, proposals: [applied] })).toEqual([]);
  });

  it("drops an entry whose target is neither a note nor a document", () => {
    const stored = to_stored([make_proposal()], SAVED_AT);
    const bad_target = {
      ...(stored.proposals[0] as object),
      target: { kind: "canvas", canvas_path: "x.canvas" },
    };

    expect(parse_stored({ ...stored, proposals: [bad_target] })).toEqual([]);
  });

  it("parses a document-target proposal", () => {
    const proposal = make_proposal({
      target: { kind: "document", file_path: "artifact.html" },
    });

    const parsed = parse_stored(to_stored([proposal], SAVED_AT));

    expect(parsed[0]?.target).toEqual({
      kind: "document",
      file_path: "artifact.html",
    });
  });

  it("degrades every corrupt file shape to an empty queue without throwing", () => {
    for (const raw of [
      null,
      undefined,
      42,
      "text",
      [],
      {},
      { version: "1", proposals: [] },
      { version: 0, proposals: [] },
      { version: 1, proposals: "not a list" },
    ]) {
      expect(parse_stored(raw)).toEqual([]);
    }
  });

  it("caps on read so an uncapped file cannot flood the store", () => {
    const stored = to_stored([make_proposal()], SAVED_AT);
    const template = stored.proposals[0] as { id: string };
    const flood = Array.from({ length: PROPOSAL_STORAGE_CAP + 10 }, (_, i) => ({
      ...template,
      id: `p-${String(i)}`,
    }));

    const parsed = parse_stored({ ...stored, proposals: flood });

    expect(parsed).toHaveLength(PROPOSAL_STORAGE_CAP);
  });
});
