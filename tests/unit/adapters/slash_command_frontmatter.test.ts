import { describe, expect, it } from "vitest";
import {
  create_commands,
  filter_commands,
} from "$lib/features/editor/adapters/slash_command_plugin";

describe("slash command: frontmatter", () => {
  it("includes a frontmatter command in create_commands()", () => {
    const commands = create_commands();
    const fm = commands.find((c) => c.id === "frontmatter");
    expect(fm).toBeDefined();
    expect(fm!.label).toBe("Properties");
    expect(fm!.is_available).toBeTypeOf("function");
  });

  it("is filterable by keyword 'frontmatter'", () => {
    const commands = create_commands();
    const filtered = filter_commands(commands, "frontmatter");
    expect(filtered.some((c) => c.id === "frontmatter")).toBe(true);
  });

  it("is filterable by keyword 'properties'", () => {
    const commands = create_commands();
    const filtered = filter_commands(commands, "properties");
    expect(filtered.some((c) => c.id === "frontmatter")).toBe(true);
  });

  it("is filterable by keyword 'tags'", () => {
    const commands = create_commands();
    const filtered = filter_commands(commands, "tags");
    expect(filtered.some((c) => c.id === "frontmatter")).toBe(true);
  });
});
