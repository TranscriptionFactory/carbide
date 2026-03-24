import { describe, expect, it } from "vitest";
import {
  parse_window_init,
  compute_title,
} from "$lib/features/window/domain/window_types";

describe("parse_window_init", () => {
  it("returns main when no params", () => {
    const params = new URLSearchParams();
    expect(parse_window_init(params)).toEqual({ kind: "main" });
  });

  it("returns main when window_kind is unrecognized", () => {
    const params = new URLSearchParams({ window_kind: "unknown" });
    expect(parse_window_init(params)).toEqual({ kind: "main" });
  });

  it("returns main with vault_path when kind is main and vault_path present", () => {
    const params = new URLSearchParams({
      window_kind: "main",
      vault_path: "/home/user/notes",
    });
    expect(parse_window_init(params)).toEqual({
      kind: "main",
      vault_path: "/home/user/notes",
    });
  });

  it("returns main with vault_path and file_path when all main params present", () => {
    const params = new URLSearchParams({
      window_kind: "main",
      vault_path: "/home/user/notes",
      file_path: "docs/note.md",
    });
    expect(parse_window_init(params)).toEqual({
      kind: "main",
      vault_path: "/home/user/notes",
      file_path: "docs/note.md",
    });
  });

  it("legacy browse kind with vault_path falls back to main", () => {
    const params = new URLSearchParams({
      window_kind: "browse",
      vault_path: "/home/user/notes",
    });
    expect(parse_window_init(params)).toEqual({
      kind: "main",
      vault_path: "/home/user/notes",
    });
  });

  it("legacy browse kind with vault_path and file_path falls back to main", () => {
    const params = new URLSearchParams({
      window_kind: "browse",
      vault_path: "/home/user/notes",
      file_path: "docs/note.md",
    });
    expect(parse_window_init(params)).toEqual({
      kind: "main",
      vault_path: "/home/user/notes",
      file_path: "docs/note.md",
    });
  });

  it("returns main when browse is missing vault_path", () => {
    const params = new URLSearchParams({ window_kind: "browse" });
    expect(parse_window_init(params)).toEqual({ kind: "main" });
  });

  it("returns viewer when all required params are present", () => {
    const params = new URLSearchParams({
      window_kind: "viewer",
      vault_path: "/home/user/notes",
      file_path: "readme.md",
    });
    expect(parse_window_init(params)).toEqual({
      kind: "viewer",
      vault_path: "/home/user/notes",
      file_path: "readme.md",
    });
  });

  it("returns main when viewer is missing file_path", () => {
    const params = new URLSearchParams({
      window_kind: "viewer",
      vault_path: "/home/user/notes",
    });
    expect(parse_window_init(params)).toEqual({
      kind: "main",
      vault_path: "/home/user/notes",
    });
  });

  it("returns main when viewer is missing vault_path", () => {
    const params = new URLSearchParams({
      window_kind: "viewer",
      file_path: "readme.md",
    });
    expect(parse_window_init(params)).toEqual({ kind: "main" });
  });
});

describe("compute_title", () => {
  it("returns Carbide for main with no vault_path", () => {
    expect(compute_title({ kind: "main" })).toBe("Carbide");
  });

  it("returns vault name for main with vault_path", () => {
    expect(
      compute_title({ kind: "main", vault_path: "/home/user/my-notes" }),
    ).toBe("Carbide — my-notes");
  });

  it("returns vault_path itself when main path has no slash", () => {
    expect(compute_title({ kind: "main", vault_path: "notes" })).toBe(
      "Carbide — notes",
    );
  });

  it("returns filename for viewer", () => {
    expect(
      compute_title({
        kind: "viewer",
        vault_path: "/home/user/notes",
        file_path: "docs/readme.md",
      }),
    ).toBe("readme.md");
  });

  it("returns file_path itself when viewer path has no slash", () => {
    expect(
      compute_title({
        kind: "viewer",
        vault_path: "/home/user/notes",
        file_path: "readme.md",
      }),
    ).toBe("readme.md");
  });
});
