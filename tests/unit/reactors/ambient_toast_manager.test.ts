import { describe, expect, it, vi } from "vitest";
import {
  AMBIENT_TOAST_DEDUPE_KEY,
  AMBIENT_TOAST_MAX_CONCURRENT,
} from "$lib/features/assistant";
import {
  AmbientToastManager,
  type AmbientToastHandle,
  type AmbientToastPort,
} from "$lib/reactors/ambient_toast";
import { make_ambient_notice } from "../helpers/assistant_notice_fixtures";

type Call = { kind: "show"; note_path: string } | { kind: "dismiss" };

function create_port() {
  const calls: Call[] = [];
  let next_handle = 0;

  const port: AmbientToastPort = {
    show(notice) {
      calls.push({ kind: "show", note_path: notice.note_path });
      next_handle += 1;
      return next_handle as AmbientToastHandle;
    },
    dismiss() {
      calls.push({ kind: "dismiss" });
    },
  };

  return { port, calls };
}

const actions = { on_review: vi.fn(), on_dismiss: vi.fn() };

function shows(calls: Call[]): Call[] {
  return calls.filter((call) => call.kind === "show");
}

describe("AmbientToastManager budget", () => {
  it("shows the first notice for a note", () => {
    const { port, calls } = create_port();

    new AmbientToastManager(port).show(make_ambient_notice(), actions);

    expect(shows(calls)).toHaveLength(1);
  });

  it("dedupes a second notice for the same note instead of stacking", () => {
    const { port, calls } = create_port();
    const manager = new AmbientToastManager(port);

    manager.show(make_ambient_notice({ note_path: "a.md" }), actions);
    manager.show(make_ambient_notice({ note_path: "a.md" }), actions);

    expect(shows(calls)).toHaveLength(1);
  });

  it("dedupes on note_path, the key the contract names", () => {
    expect(AMBIENT_TOAST_DEDUPE_KEY).toBe("note_path");

    const { port, calls } = create_port();
    const manager = new AmbientToastManager(port);

    manager.show(make_ambient_notice({ note_path: "a.md" }), actions);
    manager.show(make_ambient_notice({ note_path: "b.md" }), actions);

    expect(shows(calls)).toHaveLength(2);
  });

  // The budget is applied BEFORE the port is called. Delegating to sonner's
  // visibleToasts would queue the excess and drain it one at a time, turning
  // this burst into a serial drip.
  it("never exceeds the concurrent budget across a burst of distinct notes", () => {
    const { port, calls } = create_port();
    const manager = new AmbientToastManager(port);

    for (let i = 0; i < 10; i += 1) {
      manager.show(
        make_ambient_notice({ note_path: `note-${String(i)}.md` }),
        actions,
      );
    }

    let live = 0;
    let peak = 0;
    for (const call of calls) {
      live += call.kind === "show" ? 1 : -1;
      peak = Math.max(peak, live);
    }

    expect(peak).toBe(AMBIENT_TOAST_MAX_CONCURRENT);
    expect(AMBIENT_TOAST_MAX_CONCURRENT).toBe(1);
  });

  it("dismisses its predecessor before showing a replacement", () => {
    const { port, calls } = create_port();
    const manager = new AmbientToastManager(port);

    manager.show(make_ambient_notice({ note_path: "a.md" }), actions);
    manager.show(make_ambient_notice({ note_path: "b.md" }), actions);

    expect(calls.map((call) => call.kind)).toEqual(["show", "dismiss", "show"]);
  });

  it("passes the live toast's handle to dismiss, not a fresh one", () => {
    const dismissed: AmbientToastHandle[] = [];
    const port: AmbientToastPort = {
      show: () => 42,
      dismiss: (handle) => dismissed.push(handle),
    };
    const manager = new AmbientToastManager(port);

    manager.show(make_ambient_notice({ note_path: "a.md" }), actions);
    manager.dismiss();

    expect(dismissed).toEqual([42]);
  });

  it("ignores a dismiss aimed at a note that is not the live one", () => {
    const { port, calls } = create_port();
    const manager = new AmbientToastManager(port);

    manager.show(make_ambient_notice({ note_path: "a.md" }), actions);
    manager.dismiss("b.md");

    expect(calls.filter((call) => call.kind === "dismiss")).toHaveLength(0);
  });

  it("is a no-op when dismissing with nothing live", () => {
    const { port, calls } = create_port();

    new AmbientToastManager(port).dismiss();

    expect(calls).toEqual([]);
  });

  it("shows the same note again after its toast was dismissed", () => {
    const { port, calls } = create_port();
    const manager = new AmbientToastManager(port);

    manager.show(make_ambient_notice({ note_path: "a.md" }), actions);
    manager.dismiss();
    manager.show(make_ambient_notice({ note_path: "a.md" }), actions);

    expect(shows(calls)).toHaveLength(2);
  });
});
