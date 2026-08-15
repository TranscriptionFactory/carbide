/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { schema } from "$lib/features/editor/adapters/schema";
import { Slice, Fragment, type Node as PmNode } from "prosemirror-model";
import { serialize_clipboard_text } from "$lib/features/editor/adapters/prosemirror_adapter";

function paragraph(text: string): PmNode {
  return schema.nodes.paragraph.create(null, schema.text(text));
}

function make_callout(): PmNode {
  return schema.nodes.callout.create({ callout_type: "note" }, [
    schema.nodes.callout_title.create(null, schema.text("Title")),
    schema.nodes.callout_body.create(null, [
      paragraph("alpha one"),
      paragraph("beta two"),
    ]),
  ]);
}

function make_details(): PmNode {
  return schema.nodes.details_block.create({ open: true }, [
    schema.nodes.details_summary.create(null, schema.text("Summary")),
    schema.nodes.details_content.create(null, [
      paragraph("gamma one"),
      paragraph("delta"),
    ]),
  ]);
}

function make_doc(container: PmNode): PmNode {
  return schema.topNodeType.create(null, [
    paragraph("before"),
    container,
    paragraph("after"),
  ]);
}

function offset_of(doc: PmNode, snippet: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.isText && node.text) {
      const index = node.text.indexOf(snippet);
      if (index >= 0) found = pos + index;
    }
    return true;
  });
  if (found < 0) throw new Error(`snippet not in doc: ${snippet}`);
  return found;
}

// Mirrors Selection.content(): the cut runs from the document root, so the
// container node always travels with a partial selection.
function selection_slice(doc: PmNode, from: string, to: string): Slice {
  return doc.slice(offset_of(doc, from), offset_of(doc, to) + to.length, true);
}

function whole_node_slice(node: PmNode): Slice {
  return new Slice(Fragment.from(node), 0, 0);
}

describe("clipboardTextSerializer", () => {
  it("returns plain text for code block content", () => {
    const code_block = schema.nodes.code_block.create(
      { language: "js" },
      schema.text("const x = 1;"),
    );
    const slice = new Slice(Fragment.from(code_block), 0, 0);
    expect(serialize_clipboard_text(slice)).toBe("const x = 1;");
  });

  it("returns plain text for multiple code blocks", () => {
    const block1 = schema.nodes.code_block.create({}, schema.text("line1"));
    const block2 = schema.nodes.code_block.create({}, schema.text("line2"));
    const slice = new Slice(Fragment.from([block1, block2]), 0, 0);
    expect(serialize_clipboard_text(slice)).toBe("line1\nline2");
  });

  it("uses markdown serializer for non-code-block content", () => {
    const slice = new Slice(Fragment.from(paragraph("hello")), 0, 0);
    const result = serialize_clipboard_text(slice);
    expect(result).toContain("hello");
    expect(result).not.toContain("```");
  });

  it("uses markdown serializer for mixed content", () => {
    const code = schema.nodes.code_block.create({}, schema.text("code"));
    const slice = new Slice(Fragment.from([paragraph("hello"), code]), 0, 0);
    const result = serialize_clipboard_text(slice);
    expect(result).toContain("hello");
    expect(result).toContain("```");
  });

  it("decodes HTML character references in clipboard text", () => {
    const bold_text = schema.text(" word ", [schema.marks.strong.create()]);
    const para = schema.nodes.paragraph.create(null, [
      schema.text("before"),
      bold_text,
      schema.text("after"),
    ]);
    const slice = new Slice(Fragment.from(para), 0, 0);
    const result = serialize_clipboard_text(slice);
    expect(result).not.toContain("&#x20;");
    expect(result).not.toContain("&#x");
  });
});

describe("clipboardTextSerializer — partial callout selections", () => {
  const doc = make_doc(make_callout());

  it("copies one body paragraph as bare text", () => {
    const text = serialize_clipboard_text(selection_slice(doc, "alpha", "one"));
    expect(text.trim()).toBe("alpha one");
    expect(text).not.toContain(">");
  });

  it("drops callout markup when the selection starts in the title", () => {
    const text = serialize_clipboard_text(
      selection_slice(doc, "Title", "alpha one"),
    );
    expect(text).not.toContain("[!note]");
    expect(text).not.toContain(">");
    expect(text).toContain("Title");
    expect(text).toContain("alpha one");
  });

  it("keeps every block when the selection spans two body paragraphs", () => {
    const text = serialize_clipboard_text(
      selection_slice(doc, "alpha one", "beta two"),
    );
    expect(text.trim()).not.toBe("");
    expect(text).toContain("alpha one");
    expect(text).toContain("beta two");
    expect(text).not.toContain("[!note]");
  });

  it("keeps the title text when the selection covers the title alone", () => {
    const text = serialize_clipboard_text(
      selection_slice(doc, "Title", "Title"),
    );
    expect(text.trim()).toBe("Title");
  });

  it("keeps callout markup for a whole-node copy", () => {
    const text = serialize_clipboard_text(whole_node_slice(make_callout()));
    expect(text).toContain("> [!note] Title");
    expect(text).toContain("> alpha one");
    expect(text).toContain("> beta two");
  });

  it("keeps callout markup for an untouched callout inside a wider selection", () => {
    const text = serialize_clipboard_text(
      selection_slice(doc, "before", "after"),
    );
    expect(text).toContain("> [!note] Title");
    expect(text).toContain("before");
    expect(text).toContain("after");
  });
});

describe("clipboardTextSerializer — partial details selections", () => {
  const doc = make_doc(make_details());

  it("copies one content paragraph as bare text", () => {
    const text = serialize_clipboard_text(selection_slice(doc, "gamma", "one"));
    expect(text.trim()).toBe("gamma one");
    expect(text).not.toContain("<details");
  });

  it("drops details markup when the selection starts in the summary", () => {
    const text = serialize_clipboard_text(
      selection_slice(doc, "Summary", "gamma one"),
    );
    expect(text).not.toContain("<details");
    expect(text).not.toContain("<summary>");
    expect(text).toContain("Summary");
    expect(text).toContain("gamma one");
  });

  it("keeps every block when the selection spans two content paragraphs", () => {
    const text = serialize_clipboard_text(
      selection_slice(doc, "gamma one", "delta"),
    );
    expect(text.trim()).not.toBe("");
    expect(text).toContain("gamma one");
    expect(text).toContain("delta");
    expect(text).not.toContain("<details");
  });

  it("keeps the summary text when the selection covers the summary alone", () => {
    const text = serialize_clipboard_text(
      selection_slice(doc, "Summary", "Summary"),
    );
    expect(text.trim()).toBe("Summary");
  });

  it("keeps details markup for a whole-node copy", () => {
    const text = serialize_clipboard_text(whole_node_slice(make_details()));
    expect(text).toContain("<details open>");
    expect(text).toContain("<summary>Summary</summary>");
    expect(text).toContain("gamma one");
  });
});

describe("clipboardTextSerializer — bare wrapper nodes", () => {
  const cases: Array<[string, PmNode, string]> = [
    [
      "callout_body",
      schema.nodes.callout_body.create(null, [
        paragraph("x one"),
        paragraph("y two"),
      ]),
      "x one",
    ],
    [
      "callout_title",
      schema.nodes.callout_title.create(null, schema.text("bare title")),
      "bare title",
    ],
    [
      "details_content",
      schema.nodes.details_content.create(null, [paragraph("x one")]),
      "x one",
    ],
    [
      "details_summary",
      schema.nodes.details_summary.create(null, schema.text("bare summary")),
      "bare summary",
    ],
  ];

  it.each(cases)(
    "serializes a bare %s to its content",
    (_name, node, needle) => {
      const text = serialize_clipboard_text(whole_node_slice(node));
      expect(text.trim()).not.toBe("");
      expect(text).toContain(needle);
    },
  );
});
