import { describe, expect, it } from "vitest";
import { AssistantProposalStore } from "$lib/features/assistant";
import {
  make_proposal,
  make_proposal_hunk,
} from "../helpers/assistant_proposal_fixtures";

describe("AssistantProposalStore", () => {
  it("starts empty on construction", () => {
    const store = new AssistantProposalStore();
    expect(store.proposals).toEqual([]);
  });

  describe("add", () => {
    it("appends the proposal, preserving its created_at verbatim", () => {
      const store = new AssistantProposalStore();
      const proposal = make_proposal({ created_at: 42 });

      store.add(proposal);

      expect(store.get(proposal.id)).toEqual(proposal);
      expect(store.get(proposal.id)?.created_at).toBe(42);
    });

    it("does not dedup on a repeated id", () => {
      const store = new AssistantProposalStore();
      const first = make_proposal({ id: "dup" });
      const second = make_proposal({ id: "dup" });

      store.add(first);
      store.add(second);

      expect(store.proposals).toHaveLength(2);
    });
  });

  describe("add_many", () => {
    it("appends a whole batch in one assignment", () => {
      const store = new AssistantProposalStore();
      const batch = [make_proposal(), make_proposal(), make_proposal()];

      store.add_many(batch);

      expect(store.proposals).toEqual(batch);
    });

    it("is a no-op for an empty batch", () => {
      const store = new AssistantProposalStore();
      store.add(make_proposal());

      store.add_many([]);

      expect(store.proposals).toHaveLength(1);
    });
  });

  describe("set_status", () => {
    it("transitions a known id and leaves the rest of the proposal untouched", () => {
      const store = new AssistantProposalStore();
      const proposal = make_proposal();
      store.add(proposal);

      store.set_status(proposal.id, "applied");

      const live = store.get(proposal.id);
      expect(live?.status).toBe("applied");
      expect(live?.note_path).toBe(proposal.note_path);
    });

    it("is a raw setter with no transition validation", () => {
      const store = new AssistantProposalStore();
      const proposal = make_proposal({ status: "applied" });
      store.add(proposal);

      store.set_status(proposal.id, "pending");

      expect(store.get(proposal.id)?.status).toBe("pending");
    });

    it("is a no-op on an unknown id", () => {
      const store = new AssistantProposalStore();
      const proposal = make_proposal();
      store.add(proposal);

      expect(() => {
        store.set_status("missing", "applied");
      }).not.toThrow();
      expect(store.get(proposal.id)?.status).toBe("pending");
    });
  });

  describe("set_hunk_selected", () => {
    it("flips exactly one hunk, leaving sibling hunks and proposals alone", () => {
      const store = new AssistantProposalStore();
      const hunk_a = make_proposal_hunk({ id: "a", selected: true });
      const hunk_b = make_proposal_hunk({ id: "b", selected: true });
      const proposal = make_proposal({ hunks: [hunk_a, hunk_b] });
      const other = make_proposal();
      store.add(proposal);
      store.add(other);

      store.set_hunk_selected(proposal.id, "a", false);

      const live = store.get(proposal.id);
      expect(live?.hunks.find((hunk) => hunk.id === "a")?.selected).toBe(false);
      expect(live?.hunks.find((hunk) => hunk.id === "b")?.selected).toBe(true);
      expect(store.get(other.id)).toEqual(other);
    });

    it("is a no-op on an unknown proposal id", () => {
      const store = new AssistantProposalStore();
      const proposal = make_proposal({
        hunks: [make_proposal_hunk({ id: "a" })],
      });
      store.add(proposal);

      store.set_hunk_selected("missing", "a", false);

      expect(store.get(proposal.id)?.hunks[0]?.selected).toBe(true);
    });

    it("is a no-op on an unknown hunk id", () => {
      const store = new AssistantProposalStore();
      const proposal = make_proposal({
        hunks: [make_proposal_hunk({ id: "a" })],
      });
      store.add(proposal);

      store.set_hunk_selected(proposal.id, "missing", false);

      expect(store.get(proposal.id)?.hunks[0]?.selected).toBe(true);
    });

    it("is a no-op on a non-pending proposal", () => {
      const store = new AssistantProposalStore();
      const proposal = make_proposal({
        status: "applied",
        hunks: [make_proposal_hunk({ id: "a", selected: true })],
      });
      store.add(proposal);

      store.set_hunk_selected(proposal.id, "a", false);

      expect(store.get(proposal.id)?.hunks[0]?.selected).toBe(true);
    });
  });

  describe("set_all_hunks_selected", () => {
    it("sets every hunk uniformly", () => {
      const store = new AssistantProposalStore();
      const proposal = make_proposal({
        hunks: [
          make_proposal_hunk({ id: "a", selected: true }),
          make_proposal_hunk({ id: "b", selected: false }),
        ],
      });
      store.add(proposal);

      store.set_all_hunks_selected(proposal.id, false);

      const live = store.get(proposal.id);
      expect(live?.hunks.every((hunk) => !hunk.selected)).toBe(true);
    });

    it("is a no-op (not an error) on a proposal with zero hunks", () => {
      const store = new AssistantProposalStore();
      const proposal = make_proposal({ hunks: [] });
      store.add(proposal);

      expect(() => {
        store.set_all_hunks_selected(proposal.id, true);
      }).not.toThrow();
      expect(store.get(proposal.id)?.hunks).toEqual([]);
    });

    it("is a no-op on a non-pending proposal", () => {
      const store = new AssistantProposalStore();
      const proposal = make_proposal({
        status: "rejected",
        hunks: [make_proposal_hunk({ id: "a", selected: false })],
      });
      store.add(proposal);

      store.set_all_hunks_selected(proposal.id, true);

      expect(store.get(proposal.id)?.hunks[0]?.selected).toBe(false);
    });
  });

  describe("remove", () => {
    it("deletes the target and leaves the others alone", () => {
      const store = new AssistantProposalStore();
      const first = make_proposal();
      const second = make_proposal();
      store.add(first);
      store.add(second);

      store.remove(first.id);

      expect(store.get(first.id)).toBeNull();
      expect(store.proposals).toEqual([second]);
    });

    it("is a no-op on an unknown id", () => {
      const store = new AssistantProposalStore();
      store.add(make_proposal());

      store.remove("missing");

      expect(store.proposals).toHaveLength(1);
    });
  });

  describe("clear", () => {
    it("empties the store regardless of status mix", () => {
      const store = new AssistantProposalStore();
      store.add(make_proposal({ status: "pending" }));
      store.add(make_proposal({ status: "applied" }));
      store.add(make_proposal({ status: "stale" }));

      store.clear();

      expect(store.proposals).toEqual([]);
    });
  });

  describe("pending", () => {
    it("returns only pending proposals", () => {
      const store = new AssistantProposalStore();
      const pending = make_proposal({ status: "pending" });
      store.add(pending);
      store.add(make_proposal({ status: "applied" }));

      expect(store.pending).toEqual([pending]);
    });
  });

  describe("by_note / by_session", () => {
    it("return an empty array when nothing matches", () => {
      const store = new AssistantProposalStore();
      store.add(make_proposal());

      expect(store.by_note("nope.md")).toEqual([]);
      expect(store.by_session("nope")).toEqual([]);
    });
  });
});
