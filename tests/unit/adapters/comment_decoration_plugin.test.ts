/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { parse_markdown } from "$lib/features/editor/adapters/markdown_pipeline";
import { create_comment_decoration_plugin } from "$lib/features/editor/adapters/comment_decoration_plugin";

let view: EditorView | null = null;

function mount(markdown: string): HTMLElement {
  const host = document.createElement("div");
  view = new EditorView(host, {
    state: EditorState.create({
      doc: parse_markdown(markdown),
      plugins: [create_comment_decoration_plugin()],
    }),
  });
  return host;
}

function texts(host: HTMLElement, selector: string): string[] {
  return [...host.querySelectorAll(selector)].map((el) => el.textContent ?? "");
}

afterEach(() => {
  view?.destroy();
  view = null;
});

describe("comment rendering in the editor", () => {
  it("wraps an inline comment, markers included, in md-comment spans", () => {
    const host = mount("keep %%x *b* y%% tail");
    expect(texts(host, ".md-comment").join("")).toBe("%%x b y%%");
    expect(host.querySelector("em .md-comment")?.textContent).toBe("b");
  });

  it("renders a block comment as a comment-block element with its source", () => {
    const host = mount("before\n\n%%\nhidden *x*\n\n# H\n%%");
    expect(texts(host, ".comment-block")).toEqual([
      "%%\nhidden *x*\n\n# H\n%%",
    ]);
    expect(host.querySelector("h1")).toBeNull();
  });

  it("leaves inline code markers undecorated", () => {
    const host = mount("use `%%x%%` here");
    expect(host.querySelector(".md-comment")).toBeNull();
  });
});
