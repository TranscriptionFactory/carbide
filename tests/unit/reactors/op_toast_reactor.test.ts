import { describe, expect, it } from "vitest";
import { resolve_op_toast_commands } from "$lib/reactors/op_toast.reactor.svelte";

describe("op_toast.reactor", () => {
  it("returns clipboard success toast when operation transitions to success", () => {
    const commands = resolve_op_toast_commands({
      key: "clipboard.write",
      previous_status: "pending",
      current_status: "success",
      error: null,
      message: null,
    });

    expect(commands).toEqual([
      { kind: "success", message: "Copied to clipboard" },
    ]);
  });

  it("returns link repair success toast with operation message", () => {
    const commands = resolve_op_toast_commands({
      key: "links.repair",
      previous_status: "pending",
      current_status: "success",
      error: null,
      message: "Link repair complete: 3/5 notes updated",
    });

    expect(commands).toEqual([
      {
        kind: "success",
        message: "Link repair complete: 3/5 notes updated",
      },
    ]);
  });

  it("returns link repair error toast when operation transitions to error", () => {
    const commands = resolve_op_toast_commands({
      key: "links.repair",
      previous_status: "pending",
      current_status: "error",
      error: "Link repair failed for 2 notes",
      message: null,
    });

    expect(commands).toEqual([
      {
        kind: "error",
        message: "Some links could not be repaired",
        log_label: "Link repair failed",
        error: "Link repair failed for 2 notes",
      },
    ]);
  });

  it("returns the external import summary as a success toast", () => {
    const commands = resolve_op_toast_commands({
      key: "filetree.import_external",
      previous_status: "pending",
      current_status: "success",
      error: null,
      message: "Imported 2 files, skipped 1",
    });

    expect(commands).toEqual([
      { kind: "success", message: "Imported 2 files, skipped 1" },
    ]);
  });

  it("returns an external import error toast when nothing could be imported", () => {
    const commands = resolve_op_toast_commands({
      key: "filetree.import_external",
      previous_status: "pending",
      current_status: "error",
      error: "3 dropped file(s) could not be imported",
      message: null,
    });

    expect(commands).toEqual([
      {
        kind: "error",
        message: "Could not import dropped files",
        log_label: "External file import failed",
        error: "3 dropped file(s) could not be imported",
      },
    ]);
  });

  it("returns no commands when status is unchanged", () => {
    const commands = resolve_op_toast_commands({
      key: "links.repair",
      previous_status: "pending",
      current_status: "pending",
      error: null,
      message: null,
    });

    expect(commands).toEqual([]);
  });
});
