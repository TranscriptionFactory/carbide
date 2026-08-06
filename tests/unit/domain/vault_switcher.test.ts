import { describe, expect, it } from "vitest";
import {
  clamp_vault_selection,
  duplicate_vault_names,
  format_last_opened,
  format_note_count,
  format_vault_path,
  is_vault_available,
  move_vault_selection,
  vault_initial,
} from "$lib/features/vault/domain/vault_switcher";
import { as_vault_id, as_vault_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

describe("vault_switcher", () => {
  it("clamps selection to bounds", () => {
    expect(clamp_vault_selection(-1, 3)).toBe(0);
    expect(clamp_vault_selection(1, 3)).toBe(1);
    expect(clamp_vault_selection(10, 3)).toBe(2);
    expect(clamp_vault_selection(0, 0)).toBe(-1);
  });

  it("moves selection with wrap-around", () => {
    expect(move_vault_selection(0, 3, 1)).toBe(1);
    expect(move_vault_selection(2, 3, 1)).toBe(0);
    expect(move_vault_selection(0, 3, -1)).toBe(2);
  });

  it("starts from first or last when nothing selected", () => {
    expect(move_vault_selection(-1, 3, 1)).toBe(0);
    expect(move_vault_selection(-1, 3, -1)).toBe(2);
    expect(move_vault_selection(-1, 0, 1)).toBe(-1);
  });

  it("returns names that require path disambiguation", () => {
    const duplicate = create_test_vault({
      id: as_vault_id("vault-2"),
      path: as_vault_path("/work/secondary"),
      name: "Work",
    });
    const unique = create_test_vault({
      id: as_vault_id("vault-3"),
      path: as_vault_path("/research/main"),
      name: "Research",
    });

    const primary = create_test_vault({
      name: "Work",
      path: as_vault_path("/work/main"),
    });

    const result = duplicate_vault_names([primary, duplicate, unique]);
    expect(result.has("Work")).toBe(true);
    expect(result.has("Research")).toBe(false);
  });

  describe("format_vault_path", () => {
    it("returns full path when vault name is a duplicate", () => {
      const dupes = new Set(["Work"]);
      expect(format_vault_path("/a/b/c/Work", "Work", dupes)).toBe(
        "/a/b/c/Work",
      );
    });

    it("truncates long paths for unique names", () => {
      const dupes = new Set<string>();
      expect(format_vault_path("/home/user/docs/Work", "Work", dupes)).toBe(
        ".../docs/Work",
      );
    });

    it("returns short paths as-is for unique names", () => {
      const dupes = new Set<string>();
      expect(format_vault_path("/docs/Work", "Work", dupes)).toBe("/docs/Work");
    });
  });
});

describe("vault display helpers", () => {
  it("formats last opened relative to now with a placeholder fallback", () => {
    const vault = create_test_vault({ last_opened_at: 1000 });
    expect(format_last_opened(vault, 1000)).not.toBe("--");
    expect(format_last_opened(create_test_vault(), 1000)).toBe("--");
  });

  it("formats note counts with pluralization and placeholder", () => {
    expect(format_note_count(create_test_vault({ note_count: 0 }))).toBe(
      "0 notes",
    );
    expect(format_note_count(create_test_vault({ note_count: 1 }))).toBe(
      "1 note",
    );
    expect(format_note_count(create_test_vault({ note_count: 42 }))).toBe(
      "42 notes",
    );
    expect(format_note_count(create_test_vault())).toBe("-- notes");
    expect(format_note_count(create_test_vault({ note_count: null }))).toBe(
      "-- notes",
    );
  });

  it("treats only an explicit false as unavailable", () => {
    expect(is_vault_available(create_test_vault())).toBe(true);
    expect(is_vault_available(create_test_vault({ is_available: true }))).toBe(
      true,
    );
    expect(is_vault_available(create_test_vault({ is_available: false }))).toBe(
      false,
    );
  });

  it("derives an uppercase initial with a fallback for empty names", () => {
    expect(vault_initial("research")).toBe("R");
    expect(vault_initial("Personal")).toBe("P");
    expect(vault_initial("")).toBe("?");
  });
});
