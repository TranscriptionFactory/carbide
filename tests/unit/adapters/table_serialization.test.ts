import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

describe("table serialization", () => {
  it("round-trips simple table without trailing backslashes", () => {
    const input = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).not.toContain("\\\\");
    expect(output).toBe(input);
  });

  it("round-trips emoji shortcode table without corruption", () => {
    const input = [
      "| :smile: `:smile:` | :laugh: `:laugh:` |",
      "| --- | --- |",
      "| :wink: `:wink:` | :grin: `:grin:` |",
    ].join("\n");
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).not.toContain("\\\\");
    for (const line of output.split("\n")) {
      expect(line).not.toMatch(/\\+$/);
    }
  });

  it("round-trips table with bold/italic content", () => {
    const input = "| **bold** | *italic* |\n| --- | --- |\n| cell | cell |";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).not.toContain("\\\\");
    expect(output).toBe(input);
  });

  it("preserves table alignment markers", () => {
    const input =
      "| Left | Center | Right |\n| --- | :---: | ---: |\n| a | b | c |";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).toContain(":---:");
    expect(output).toContain("---:");
  });

  it("round-trips exact emoji file table content", () => {
    const input = [
      "| :bowtie:  `:bowtie:` | :smile:  `:smile:` | :laughing:  `:laughing:` |",
      "|---|---|---|",
      "| :blush:  `:blush:` | :smiley:  `:smiley:` | :relaxed:  `:relaxed:` |",
    ].join("\n");
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    // No trailing backslashes on any line
    for (const line of output.split("\n")) {
      expect(line).not.toMatch(/\\+\s*$/);
    }
    // No double-backslash anywhere
    expect(output).not.toContain("\\\\");
    // Doc node structure is a table
    expect(doc.child(0).type.name).toBe("table");
  });

  it("round-trips large emoji table without corruption", () => {
    const lines = [
      "| :bowtie:  `:bowtie:` | :smile:  `:smile:` | :laughing:  `:laughing:` |",
      "|---|---|---|",
    ];
    for (let i = 0; i < 20; i++) {
      lines.push(
        "| :blush:  `:blush:` | :smiley:  `:smiley:` | :relaxed:  `:relaxed:` |",
      );
    }
    const input = lines.join("\n");
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    for (const line of output.split("\n")) {
      expect(line).not.toMatch(/\\+\s*$/);
    }
  });

  it("converts emoji shortcodes to unicode on initial parse", () => {
    const input = "Hello :smile: world";
    const doc = parse_markdown(input);
    const text = doc.textContent;
    expect(text).not.toContain(":smile:");
    expect(text).toContain("\u{1F604}");
  });

  it("converts emoji shortcodes in table cells on parse", () => {
    const input = "| :smile: | :heart: |\n| --- | --- |\n| :+1: | :star: |";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).not.toContain(":smile:");
    expect(output).not.toContain(":heart:");
  });
});
