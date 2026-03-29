import { describe, expect, it } from "vitest";
import { resolve_key_sequence, is_vim_nav_prefix } from "$lib/features/vim_nav";

describe("resolve_key_sequence", () => {
  describe("file_tree context", () => {
    it("resolves j to file_tree.down", () => {
      const result = resolve_key_sequence("file_tree", "j");
      expect(result).toEqual({
        status: "matched",
        action_id: "vim_nav.file_tree.down",
        count: 1,
      });
    });

    it("resolves k to file_tree.up", () => {
      const result = resolve_key_sequence("file_tree", "k");
      expect(result).toEqual({
        status: "matched",
        action_id: "vim_nav.file_tree.up",
        count: 1,
      });
    });

    it("resolves gg to file_tree.top", () => {
      const result = resolve_key_sequence("file_tree", "gg");
      expect(result).toEqual({
        status: "matched",
        action_id: "vim_nav.file_tree.top",
        count: 1,
      });
    });

    it("resolves G to file_tree.bottom", () => {
      const result = resolve_key_sequence("file_tree", "G");
      expect(result).toEqual({
        status: "matched",
        action_id: "vim_nav.file_tree.bottom",
        count: 1,
      });
    });

    it("resolves dd to note.request_delete", () => {
      const result = resolve_key_sequence("file_tree", "dd");
      expect(result).toEqual({
        status: "matched",
        action_id: "note.request_delete",
        count: 1,
      });
    });

    it("resolves h to collapse", () => {
      const result = resolve_key_sequence("file_tree", "h");
      expect(result).toEqual({
        status: "matched",
        action_id: "vim_nav.file_tree.collapse",
        count: 1,
      });
    });

    it("resolves l to expand_or_open", () => {
      const result = resolve_key_sequence("file_tree", "l");
      expect(result).toEqual({
        status: "matched",
        action_id: "vim_nav.file_tree.expand_or_open",
        count: 1,
      });
    });
  });

  describe("count prefixes", () => {
    it("parses count prefix for j", () => {
      const result = resolve_key_sequence("file_tree", "5j");
      expect(result).toEqual({
        status: "matched",
        action_id: "vim_nav.file_tree.down",
        count: 5,
      });
    });

    it("ignores count for non-countable keys", () => {
      const result = resolve_key_sequence("file_tree", "3h");
      expect(result).toEqual({
        status: "matched",
        action_id: "vim_nav.file_tree.collapse",
        count: 1,
      });
    });
  });

  describe("tab_bar context", () => {
    it("resolves J to tab.next", () => {
      const result = resolve_key_sequence("tab_bar", "J");
      expect(result).toEqual({
        status: "matched",
        action_id: "tab.next",
        count: 1,
      });
    });

    it("resolves gt to tab.next", () => {
      const result = resolve_key_sequence("tab_bar", "gt");
      expect(result).toEqual({
        status: "matched",
        action_id: "tab.next",
        count: 1,
      });
    });

    it("resolves x to tab.close", () => {
      const result = resolve_key_sequence("tab_bar", "x");
      expect(result).toEqual({
        status: "matched",
        action_id: "tab.close",
        count: 1,
      });
    });
  });

  describe("outline context", () => {
    it("resolves j/k for outline", () => {
      expect(resolve_key_sequence("outline", "j").status).toBe("matched");
      expect(resolve_key_sequence("outline", "k").status).toBe("matched");
    });

    it("resolves Enter to outline.select", () => {
      const result = resolve_key_sequence("outline", "Enter");
      expect(result).toEqual({
        status: "matched",
        action_id: "vim_nav.outline.select",
        count: 1,
      });
    });
  });

  describe("global keys", () => {
    it("resolves : to omnibar.toggle from any context", () => {
      const result = resolve_key_sequence("file_tree", ":");
      expect(result).toEqual({
        status: "matched",
        action_id: "omnibar.toggle",
        count: 1,
      });
    });

    it("resolves ? to cheatsheet.toggle", () => {
      const result = resolve_key_sequence("tab_bar", "?");
      expect(result).toEqual({
        status: "matched",
        action_id: "vim_nav.cheatsheet.toggle",
        count: 1,
      });
    });

    it("resolves space+e to focus explorer", () => {
      const result = resolve_key_sequence("tab_bar", " e");
      expect(result).toEqual({
        status: "matched",
        action_id: "vim_nav.focus.explorer",
        count: 1,
      });
    });
  });

  describe("no match", () => {
    it("returns no_match for unknown keys", () => {
      expect(resolve_key_sequence("file_tree", "z")).toEqual({
        status: "no_match",
      });
    });

    it("returns no_match for none context", () => {
      expect(resolve_key_sequence("none", "j")).toEqual({
        status: "no_match",
      });
    });
  });

  describe("pending sequences", () => {
    it("returns pending for g prefix in file_tree", () => {
      expect(resolve_key_sequence("file_tree", "g")).toEqual({
        status: "pending",
      });
    });

    it("returns pending for d prefix in file_tree", () => {
      expect(resolve_key_sequence("file_tree", "d")).toEqual({
        status: "pending",
      });
    });

    it("returns pending for space prefix", () => {
      expect(resolve_key_sequence("file_tree", " ")).toEqual({
        status: "pending",
      });
    });
  });
});

describe("is_vim_nav_prefix", () => {
  it("recognizes g as prefix", () => {
    expect(is_vim_nav_prefix("", "g")).toBe(true);
  });

  it("recognizes d as prefix", () => {
    expect(is_vim_nav_prefix("", "d")).toBe(true);
  });

  it("recognizes space as prefix", () => {
    expect(is_vim_nav_prefix("", " ")).toBe(true);
  });

  it("recognizes digits as prefix", () => {
    expect(is_vim_nav_prefix("", "5")).toBe(true);
    expect(is_vim_nav_prefix("5", "3")).toBe(true);
  });

  it("recognizes g followed by valid suffixes", () => {
    expect(is_vim_nav_prefix("g", "g")).toBe(true);
    expect(is_vim_nav_prefix("g", "t")).toBe(true);
    expect(is_vim_nav_prefix("g", "T")).toBe(true);
  });

  it("rejects g followed by invalid suffixes", () => {
    expect(is_vim_nav_prefix("g", "z")).toBe(false);
  });

  it("recognizes space followed by valid suffixes", () => {
    expect(is_vim_nav_prefix(" ", "e")).toBe(true);
    expect(is_vim_nav_prefix(" ", "o")).toBe(true);
    expect(is_vim_nav_prefix(" ", "t")).toBe(true);
    expect(is_vim_nav_prefix(" ", "f")).toBe(true);
  });

  it("rejects space followed by invalid suffixes", () => {
    expect(is_vim_nav_prefix(" ", "z")).toBe(false);
  });

  it("does not treat regular keys as prefix", () => {
    expect(is_vim_nav_prefix("", "j")).toBe(false);
    expect(is_vim_nav_prefix("", "k")).toBe(false);
  });
});
