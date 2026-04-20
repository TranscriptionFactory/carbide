import { describe, expect, it } from "vitest";
import { MarkdownJoiner } from "$lib/features/ai/domain/markdown_joiner";

describe("MarkdownJoiner", () => {
  it("passes plain text through immediately", () => {
    const joiner = new MarkdownJoiner();
    expect(joiner.process_chunk("hello world")).toBe("hello world");
  });

  it("buffers when chunk ends with asterisk", () => {
    const joiner = new MarkdownJoiner();
    expect(joiner.process_chunk("hello *")).toBe("");
    expect(joiner.process_chunk("*bold**")).toBe("hello **bold**");
  });

  it("buffers trailing bold opener", () => {
    const joiner = new MarkdownJoiner();
    expect(joiner.process_chunk("start **")).toBe("");
    expect(joiner.process_chunk("bold** end")).toBe("start **bold** end");
  });

  it("buffers trailing backtick", () => {
    const joiner = new MarkdownJoiner();
    expect(joiner.process_chunk("use `")).toBe("");
    expect(joiner.process_chunk("code` here")).toBe("use `code` here");
  });

  it("buffers unclosed brackets", () => {
    const joiner = new MarkdownJoiner();
    expect(joiner.process_chunk("see [lin")).toBe("");
    expect(joiner.process_chunk("k](url) done")).toBe("see [link](url) done");
  });

  it("force-flushes buffer over 30 chars", () => {
    const joiner = new MarkdownJoiner();
    const long = "a".repeat(31) + "*";
    const result = joiner.process_chunk(long);
    expect(result).toBe(long);
  });

  it("flushes on newline even with pending syntax after", () => {
    const joiner = new MarkdownJoiner();
    expect(joiner.process_chunk("line one\nstart *")).toBe("line one\n");
    expect(joiner.process_chunk("bold** end")).toBe("start *bold** end");
  });

  it("enters code block mode on fence", () => {
    const joiner = new MarkdownJoiner();
    const result = joiner.process_chunk("```js\n");
    expect(result).toBe("```js\n");
  });

  it("passes code block content line-by-line", () => {
    const joiner = new MarkdownJoiner();
    joiner.process_chunk("```\n");
    expect(joiner.process_chunk("let x = *;\n")).toBe("let x = *;\n");
  });

  it("exits code block on closing fence", () => {
    const joiner = new MarkdownJoiner();
    joiner.process_chunk("```\n");
    joiner.process_chunk("code\n");
    const result = joiner.process_chunk("```");
    expect(result).toBe("```");
  });

  it("flush returns remaining buffer", () => {
    const joiner = new MarkdownJoiner();
    joiner.process_chunk("partial *");
    expect(joiner.flush()).toBe("partial *");
  });

  it("flush on empty buffer returns empty string", () => {
    const joiner = new MarkdownJoiner();
    expect(joiner.flush()).toBe("");
  });

  it("handles multiple chunks of plain text", () => {
    const joiner = new MarkdownJoiner();
    expect(joiner.process_chunk("hello ")).toBe("hello ");
    expect(joiner.process_chunk("world")).toBe("world");
  });

  it("handles tilde fences", () => {
    const joiner = new MarkdownJoiner();
    const result = joiner.process_chunk("~~~\n");
    expect(result).toBe("~~~\n");
  });

  it("handles pipe character buffering for tables", () => {
    const joiner = new MarkdownJoiner();
    expect(joiner.process_chunk("| col1 |")).toBe("");
    expect(joiner.process_chunk(" col2 |\n")).toBe("| col1 | col2 |\n");
  });

  it("flushes even asterisks (closed bold)", () => {
    const joiner = new MarkdownJoiner();
    expect(joiner.process_chunk("text **bold**")).toBe("text **bold**");
  });

  it("buffers single trailing underscore", () => {
    const joiner = new MarkdownJoiner();
    expect(joiner.process_chunk("text _")).toBe("");
    expect(joiner.process_chunk("italic_ end")).toBe("text _italic_ end");
  });
});
