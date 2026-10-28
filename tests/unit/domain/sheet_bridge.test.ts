import { describe, expect, it, vi } from "vitest";
import {
  create_sheet_bridge,
  parse_sheet_message,
  sheet_delimiter_for_path,
  type SheetTheme,
} from "$lib/features/document/domain/sheet_bridge";
import { create_fake_sheet_iframe } from "../helpers/fake_sheet_iframe";

function create_harness(file_path = "data/table.csv", content = "a,b\n1,2\n") {
  const iframe = create_fake_sheet_iframe();
  const calls: string[] = [];
  let theme: SheetTheme = "light";
  const on_change = vi.fn((text: string) => calls.push(`change:${text}`));
  const on_save_requested = vi.fn(() => calls.push("save"));
  const on_load_failed = vi.fn();
  const bridge = create_sheet_bridge({
    content: () => content,
    delimiter: () => sheet_delimiter_for_path(file_path),
    theme: () => theme,
    post: iframe.post,
    on_change,
    on_save_requested,
    on_load_failed,
  });
  return {
    bridge,
    iframe,
    calls,
    on_change,
    on_save_requested,
    on_load_failed,
    set_theme: (t: SheetTheme) => {
      theme = t;
    },
  };
}

describe("sheet delimiter", () => {
  it("sends tab for .tsv and null otherwise", () => {
    expect(sheet_delimiter_for_path("a/b.tsv")).toBe("\t");
    expect(sheet_delimiter_for_path("a/B.TSV")).toBe("\t");
    expect(sheet_delimiter_for_path("a/b.csv")).toBeNull();
  });
});

describe("sheet bridge", () => {
  it("answers ready with init_sheet then theme_sync", () => {
    const { bridge, iframe, set_theme } = create_harness();
    set_theme("dark");
    bridge.handle_message({ type: "ready" });
    expect(iframe.posted).toEqual([
      { type: "init_sheet", text: "a,b\n1,2\n", delimiter: null },
      { type: "theme_sync", theme: "dark" },
    ]);
  });

  it("sends the tab delimiter for tsv files", () => {
    const { bridge, iframe } = create_harness("x.tsv", "a\tb\n");
    bridge.handle_message({ type: "ready" });
    expect(iframe.posted[0]).toEqual({
      type: "init_sheet",
      text: "a\tb\n",
      delimiter: "\t",
    });
  });

  it("re-syncs theme only after ready", () => {
    const { bridge, iframe, set_theme } = create_harness();
    bridge.sync_theme();
    expect(iframe.posted).toEqual([]);
    bridge.handle_message({ type: "ready" });
    set_theme("dark");
    bridge.sync_theme();
    expect(iframe.posted.at(-1)).toEqual({ type: "theme_sync", theme: "dark" });
  });

  it("requests text on sheet_changed and forwards the response without saving", () => {
    const { bridge, iframe, on_change, on_save_requested } = create_harness();
    bridge.handle_message({ type: "sheet_changed" });
    expect(iframe.posted_types()).toEqual(["get_text"]);
    bridge.handle_message({ type: "text_response", text: "x,y\n" });
    expect(on_change).toHaveBeenCalledWith("x,y\n");
    expect(on_save_requested).not.toHaveBeenCalled();
  });

  it("delivers text before saving on save_requested", () => {
    const { bridge, iframe, calls } = create_harness();
    bridge.handle_message({ type: "save_requested" });
    expect(iframe.posted_types()).toEqual(["get_text"]);
    bridge.handle_message({ type: "text_response", text: "x\n" });
    expect(calls).toEqual(["change:x\n", "save"]);
    bridge.handle_message({ type: "text_response", text: "y\n" });
    expect(calls).toEqual(["change:x\n", "save", "change:y\n"]);
  });

  it("reports load_failed with its reason", () => {
    const { bridge, on_load_failed } = create_harness();
    bridge.handle_message({ type: "load_failed", reason: "wasm" });
    expect(on_load_failed).toHaveBeenCalledWith("wasm");
  });

  it.each([
    null,
    undefined,
    "ready",
    42,
    {},
    { type: 1 },
    { type: "unknown" },
    { type: "text_response" },
    { type: "text_response", text: 5 },
  ])("ignores malformed message %j", (data) => {
    const { bridge, iframe, on_change, on_save_requested } = create_harness();
    bridge.handle_message(data);
    expect(iframe.posted).toEqual([]);
    expect(on_change).not.toHaveBeenCalled();
    expect(on_save_requested).not.toHaveBeenCalled();
    expect(parse_sheet_message(data)).toBeNull();
  });
});
