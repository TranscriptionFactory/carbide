import { describe, it, expect } from "vitest";
import { parse_embed_config } from "$lib/features/task_list/domain/parse_embed_config";

describe("parse_embed_config", () => {
  it("parses a simple list name", () => {
    const result = parse_embed_config("list: Sprint 1");
    expect(result).toEqual({ list_name: "Sprint 1" });
  });

  it("trims whitespace from list name", () => {
    const result = parse_embed_config("list:   My Tasks  ");
    expect(result).toEqual({ list_name: "My Tasks" });
  });

  it("is case-insensitive for the key", () => {
    const result = parse_embed_config("List: Weekly");
    expect(result).toEqual({ list_name: "Weekly" });
  });

  it("handles multiline body with extra lines", () => {
    const result = parse_embed_config(
      "# comment\nlist: Sprint 1\nother: ignored",
    );
    expect(result).toEqual({ list_name: "Sprint 1" });
  });

  it("returns null for empty body", () => {
    expect(parse_embed_config("")).toBeNull();
  });

  it("returns null when no list key is present", () => {
    expect(parse_embed_config("filter: status=todo")).toBeNull();
  });

  it("returns null for empty list name", () => {
    expect(parse_embed_config("list: ")).toBeNull();
  });
});
