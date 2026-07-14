import { describe, expect, it } from "vitest";
import {
  can_write_width_frontmatter,
  read_frontmatter_width_mode,
  resolve_width_mode,
} from "$lib/features/editor/domain/note_width_mode";

describe("read_frontmatter_width_mode", () => {
  it("reads _width: wide from frontmatter", () => {
    expect(read_frontmatter_width_mode("---\n_width: wide\n---\nBody")).toBe(
      "wide",
    );
  });

  it("reads _width: normal from frontmatter", () => {
    expect(read_frontmatter_width_mode("---\n_width: normal\n---\nBody")).toBe(
      "normal",
    );
  });

  it("returns null when _width is missing", () => {
    expect(read_frontmatter_width_mode("---\ntitle: Note\n---\nBody")).toBe(
      null,
    );
  });

  it("returns null for an unknown _width value", () => {
    expect(read_frontmatter_width_mode("---\n_width: huge\n---\nBody")).toBe(
      null,
    );
  });

  it("returns null without frontmatter", () => {
    expect(read_frontmatter_width_mode("Just a body")).toBe(null);
  });

  it("returns null for unparseable yaml", () => {
    expect(read_frontmatter_width_mode("---\n_width: [broken\n---\nBody")).toBe(
      null,
    );
  });
});

describe("resolve_width_mode", () => {
  it("prefers the transient override over frontmatter and default", () => {
    expect(
      resolve_width_mode("wide", "---\n_width: normal\n---\nBody", "normal"),
    ).toBe("wide");
  });

  it("falls back to frontmatter when no transient override", () => {
    expect(
      resolve_width_mode(undefined, "---\n_width: wide\n---\nBody", "normal"),
    ).toBe("wide");
  });

  it("falls back to the app default when neither is set", () => {
    expect(resolve_width_mode(undefined, "Body", "wide")).toBe("wide");
  });

  it("falls back to the app default for a missing note", () => {
    expect(resolve_width_mode(undefined, null, "normal")).toBe("normal");
  });

  it("ignores invalid frontmatter values", () => {
    expect(
      resolve_width_mode(undefined, "---\n_width: huge\n---\nBody", "normal"),
    ).toBe("normal");
  });
});

describe("can_write_width_frontmatter", () => {
  it("allows notes without frontmatter", () => {
    expect(can_write_width_frontmatter("Just a body")).toBe(true);
  });

  it("allows empty frontmatter", () => {
    expect(can_write_width_frontmatter("---\n---\nBody")).toBe(true);
  });

  it("allows valid frontmatter", () => {
    expect(can_write_width_frontmatter("---\ntitle: Note\n---\nBody")).toBe(
      true,
    );
  });

  it("rejects an opening fence without a closing fence", () => {
    expect(can_write_width_frontmatter("---\ntitle: Note\nBody")).toBe(false);
  });

  it("rejects unparseable yaml", () => {
    expect(can_write_width_frontmatter("---\ntitle: [broken\n---\nBody")).toBe(
      false,
    );
  });

  it("rejects non-mapping yaml", () => {
    expect(can_write_width_frontmatter("---\n- a\n- b\n---\nBody")).toBe(false);
  });

  it("rejects scalar yaml", () => {
    expect(can_write_width_frontmatter("---\n42\n---\nBody")).toBe(false);
    expect(can_write_width_frontmatter("---\nhello\n---\nBody")).toBe(false);
  });

  it("allows a thematic break that is not a fence", () => {
    expect(can_write_width_frontmatter("----\nBody")).toBe(true);
  });
});
