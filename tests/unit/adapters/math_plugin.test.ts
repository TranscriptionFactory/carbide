import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import {
  extract_slash_query_from_state,
  filter_commands,
  create_commands,
} from "$lib/features/editor/adapters/slash_command_plugin";

function create_schema_with_math() {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: {
        group: "block",
        content: "inline*",
        toDOM: () => ["p", 0] as const,
        parseDOM: [{ tag: "p" }],
      },
      code_block: {
        group: "block",
        content: "text*",
        code: true,
        toDOM: () => ["pre", ["code", 0]] as const,
        parseDOM: [{ tag: "pre" }],
      },
      math_block: {
        group: "block",
        atom: true,
        attrs: { value: { default: "" } },
        toDOM: (node) =>
          [
            "div",
            {
              "data-type": "math_block",
              "data-value": String(node.attrs["value"] ?? ""),
            },
          ] as const,
        parseDOM: [{ tag: "div[data-type='math_block']" }],
      },
      math_inline: {
        group: "inline",
        inline: true,
        atom: true,
        content: "text*",
        toDOM: () => ["span", { "data-type": "math_inline" }, 0] as const,
        parseDOM: [{ tag: "span[data-type='math_inline']" }],
      },
      text: { group: "inline" },
    },
  });
}

function make_math_block_state(): EditorState {
  const schema = create_schema_with_math();
  const block = schema.nodes["math_block"].create({ value: "x^2" });
  const doc = schema.nodes["doc"].create(null, [block]);
  return EditorState.create({ doc });
}

describe("extract_slash_query_from_state with math_block", () => {
  it("returns null when inside a math_block (atom node, parent is doc)", () => {
    const state = make_math_block_state();
    expect(extract_slash_query_from_state(state)).toBeNull();
  });
});

describe("filter_commands includes math", () => {
  const all = create_commands();

  it("finds math command by 'math'", () => {
    const results = filter_commands(all, "math");
    expect(results.some((c) => c.id === "math")).toBe(true);
  });

  it("finds math command by 'latex'", () => {
    const results = filter_commands(all, "latex");
    expect(results.some((c) => c.id === "math")).toBe(true);
  });

  it("finds math command by 'equation'", () => {
    const results = filter_commands(all, "equation");
    expect(results.some((c) => c.id === "math")).toBe(true);
  });
});

describe("create_commands includes math", () => {
  it("contains math command", () => {
    const commands = create_commands();
    const ids = commands.map((c) => c.id);
    expect(ids).toContain("math");
  });

  it("math command has required fields", () => {
    const commands = create_commands();
    const math = commands.find((c) => c.id === "math");
    expect(math).toBeDefined();
    expect(math?.label.length).toBeGreaterThan(0);
    expect(math?.icon.length).toBeGreaterThan(0);
    expect(math?.keywords).toContain("math");
    expect(math?.keywords).toContain("latex");
  });
});
