import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  create_html_embed_plugin,
  html_embed_plugin_key,
} from "$lib/features/editor/adapters/html_embed_input_plugin";

function doc_with_paragraph(text: string): ProseNode {
  return schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
}

function find_node(doc: ProseNode, type_name: string): ProseNode | null {
  let found: ProseNode | null = null;
  doc.descendants((node) => {
    if (found) return false;
    if (node.type.name === type_name) {
      found = node;
      return false;
    }
    return true;
  });
  return found;
}

function full_scan(text: string): EditorState {
  const plugin = create_html_embed_plugin();
  const state = EditorState.create({
    doc: doc_with_paragraph(text),
    plugins: [plugin],
  });
  return state.apply(
    state.tr.setMeta(html_embed_plugin_key, { action: "full_scan" }),
  );
}

describe("html embed input plugin (full scan)", () => {
  it("converts a typed iframe paragraph into a web_embed node", () => {
    const next = full_scan(
      `<iframe src="https://example.com/x" width="640"></iframe>`,
    );
    const embed = find_node(next.doc, "web_embed");
    expect(embed).not.toBeNull();
    expect(embed?.attrs["src"]).toBe("https://example.com/x");
    expect(embed?.attrs["width"]).toBe("640");
  });

  it("converts a typed video paragraph into a video node", () => {
    const next = full_scan(`<video src="clip.mp4" controls></video>`);
    const video = find_node(next.doc, "video");
    expect(video).not.toBeNull();
    expect(video?.attrs["src"]).toBe("clip.mp4");
    expect(video?.attrs["controls"]).toBe(true);
  });

  it("leaves ordinary paragraphs untouched", () => {
    const next = full_scan("just some prose");
    expect(find_node(next.doc, "web_embed")).toBeNull();
    expect(find_node(next.doc, "video")).toBeNull();
    expect(next.doc.firstChild?.type.name).toBe("paragraph");
  });

  it("ignores non-embed html", () => {
    const next = full_scan(`<div>not an embed</div>`);
    expect(find_node(next.doc, "web_embed")).toBeNull();
  });
});

describe("html embed input plugin (incremental)", () => {
  it("converts on inline typing within the active paragraph", () => {
    const plugin = create_html_embed_plugin();
    let state = EditorState.create({
      doc: doc_with_paragraph(""),
      plugins: [plugin],
    });
    state = state.apply(
      state.tr.insertText(`<iframe src="https://x.com"></iframe>`, 1),
    );
    const embed = find_node(state.doc, "web_embed");
    expect(embed?.attrs["src"]).toBe("https://x.com");
  });
});
