import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  create_key_sequence_state,
  process_key,
  clear_sequence,
} from "$lib/features/vim_nav";

describe("key_sequence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves single key immediately", () => {
    const state = create_key_sequence_state();
    const result = process_key(state, "file_tree", "j", vi.fn());
    expect(result).toEqual({
      status: "matched",
      action_id: "vim_nav.file_tree.down",
      count: 1,
    });
    expect(state.pending).toBe("");
  });

  it("accumulates multi-key sequence", () => {
    const state = create_key_sequence_state();
    const on_clear = vi.fn();

    const r1 = process_key(state, "file_tree", "g", on_clear);
    expect(r1.status).toBe("pending");
    expect(state.pending).toBe("g");

    const r2 = process_key(state, "file_tree", "g", on_clear);
    expect(r2).toEqual({
      status: "matched",
      action_id: "vim_nav.file_tree.top",
      count: 1,
    });
    expect(state.pending).toBe("");
  });

  it("accumulates dd sequence", () => {
    const state = create_key_sequence_state();
    const on_clear = vi.fn();

    const r1 = process_key(state, "file_tree", "d", on_clear);
    expect(r1.status).toBe("pending");

    const r2 = process_key(state, "file_tree", "d", on_clear);
    expect(r2).toEqual({
      status: "matched",
      action_id: "note.request_delete",
      count: 1,
    });
  });

  it("times out pending sequence", () => {
    const state = create_key_sequence_state();
    const on_clear = vi.fn();

    process_key(state, "file_tree", "g", on_clear);
    expect(state.pending).toBe("g");

    vi.advanceTimersByTime(500);

    expect(state.pending).toBe("");
    expect(on_clear).toHaveBeenCalledOnce();
  });

  it("clears timeout on new key", () => {
    const state = create_key_sequence_state();
    const on_clear = vi.fn();

    process_key(state, "file_tree", "g", on_clear);
    process_key(state, "file_tree", "g", on_clear);

    vi.advanceTimersByTime(500);
    expect(on_clear).not.toHaveBeenCalled();
  });

  it("handles count prefix", () => {
    const state = create_key_sequence_state();
    const on_clear = vi.fn();

    const r1 = process_key(state, "file_tree", "5", on_clear);
    expect(r1.status).toBe("pending");

    const r2 = process_key(state, "file_tree", "j", on_clear);
    expect(r2).toEqual({
      status: "matched",
      action_id: "vim_nav.file_tree.down",
      count: 5,
    });
  });

  it("returns no_match for unknown sequences", () => {
    const state = create_key_sequence_state();
    const result = process_key(state, "file_tree", "z", vi.fn());
    expect(result.status).toBe("no_match");
  });

  it("clear_sequence resets state", () => {
    const state = create_key_sequence_state();
    process_key(state, "file_tree", "g", vi.fn());
    expect(state.pending).toBe("g");

    clear_sequence(state);
    expect(state.pending).toBe("");
  });

  it("resolves global keys from context-specific areas", () => {
    const state = create_key_sequence_state();
    const result = process_key(state, "file_tree", ":", vi.fn());
    expect(result).toEqual({
      status: "matched",
      action_id: "omnibar.toggle",
      count: 1,
    });
  });

  it("resolves space leader sequences", () => {
    const state = create_key_sequence_state();
    const on_clear = vi.fn();

    const r1 = process_key(state, "file_tree", " ", on_clear);
    expect(r1.status).toBe("pending");

    const r2 = process_key(state, "file_tree", "e", on_clear);
    expect(r2).toEqual({
      status: "matched",
      action_id: "vim_nav.focus.explorer",
      count: 1,
    });
  });
});
