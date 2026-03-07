import { describe, expect, it } from "vitest";
import {
  compute_title,
  parse_window_init,
  serialize_window_init,
} from "$lib/features/window/domain/window_types";

describe("compute_title", () => {
  it("returns 'otterly' for main window", () => {
    expect(compute_title({ kind: "main" })).toBe("otterly");
  });

  it("returns folder name from path for browse window", () => {
    expect(
      compute_title({
        kind: "browse",
        vault_id: "v1",
        folder_path: "notes/research",
      }),
    ).toBe("research");
  });

  it("returns fallback for empty folder path", () => {
    expect(
      compute_title({ kind: "browse", vault_id: "v1", folder_path: "" }),
    ).toBe("Browse");
  });

  it("returns file name for viewer window", () => {
    expect(
      compute_title({
        kind: "viewer",
        vault_id: "v1",
        file_path: "docs/paper.pdf",
        file_name: "paper.pdf",
      }),
    ).toBe("paper.pdf");
  });
});

describe("serialize_window_init / parse_window_init", () => {
  it("round-trips main init", () => {
    const init = { kind: "main" as const };
    expect(parse_window_init(serialize_window_init(init))).toEqual(init);
  });

  it("round-trips browse init", () => {
    const init = {
      kind: "browse" as const,
      vault_id: "v1",
      folder_path: "notes/research",
    };
    expect(parse_window_init(serialize_window_init(init))).toEqual(init);
  });

  it("round-trips viewer init", () => {
    const init = {
      kind: "viewer" as const,
      vault_id: "v1",
      file_path: "docs/paper.pdf",
      file_name: "paper.pdf",
    };
    expect(parse_window_init(serialize_window_init(init))).toEqual(init);
  });

  it("returns main for null input", () => {
    expect(parse_window_init(null)).toEqual({ kind: "main" });
  });

  it("returns main for invalid JSON", () => {
    expect(parse_window_init("invalid json")).toEqual({ kind: "main" });
  });

  it("returns main for unknown kind", () => {
    expect(parse_window_init('{"kind":"unknown"}')).toEqual({ kind: "main" });
  });
});
