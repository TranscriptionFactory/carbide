import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import {
  parse_markdown,
  schema,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { compute_doc_diff_replacement } from "$lib/features/editor/domain/doc_diff";

function details_count(doc: ProseNode): number {
  let n = 0;
  doc.descendants((node) => {
    if (node.type.name === "details_block") n++;
    return true;
  });
  return n;
}

// Mirrors prosemirror_adapter.apply_markdown_diff: compute the minimal
// structural diff between the live doc and the re-parsed markdown, then apply
// it as a single replace step.
function apply_diff(old_doc: ProseNode, new_markdown: string): ProseNode {
  const new_doc = parse_markdown(new_markdown);
  const replacement = compute_doc_diff_replacement(old_doc, new_doc);
  if (!replacement) return old_doc;
  const state = EditorState.create({ schema, doc: old_doc });
  const tr = state.tr.replace(
    replacement.from,
    replacement.to,
    replacement.slice,
  );
  return tr.doc;
}

const WITH_DETAILS = [
  "Intro paragraph.",
  "",
  "<details>",
  "<summary>My Section</summary>",
  "",
  "Hidden line one.",
  "",
  "Hidden line two.",
  "",
  "</details>",
  "",
  "Outro paragraph.",
].join("\n");

describe("compute_doc_diff_replacement preserves nested structure", () => {
  it("returns null when documents are identical", () => {
    const doc = parse_markdown(WITH_DETAILS);
    expect(compute_doc_diff_replacement(doc, doc)).toBeNull();
  });

  it("keeps the collapsible wrapper when editing text inside it", () => {
    const doc = parse_markdown(WITH_DETAILS);
    expect(details_count(doc)).toBe(1);

    const edited = WITH_DETAILS.replace("Hidden line one.", "Hidden line ONE!");
    const result = apply_diff(doc, edited);

    expect(details_count(result), "exactly one details block survives").toBe(1);
    expect(result.textContent).toContain("Hidden line ONE!");
    expect(result.textContent).toContain("Hidden line two.");
  });

  it("keeps the collapsible wrapper when editing its summary", () => {
    const doc = parse_markdown(WITH_DETAILS);
    const edited = WITH_DETAILS.replace("My Section", "My Renamed Section");
    const result = apply_diff(doc, edited);

    expect(details_count(result)).toBe(1);
    const details = result.child(1);
    expect(details.child(0).textContent).toBe("My Renamed Section");
    expect(details.child(1).textContent).toContain("Hidden line one.");
  });

  it("keeps the wrapper when adding a block inside the collapsible", () => {
    const doc = parse_markdown(WITH_DETAILS);
    const edited = WITH_DETAILS.replace(
      "Hidden line two.",
      "Hidden line two.\n\nHidden line three.",
    );
    const result = apply_diff(doc, edited);

    expect(details_count(result)).toBe(1);
    expect(result.textContent).toContain("Hidden line three.");
  });

  it("replaces a top-level block without touching the collapsible", () => {
    const doc = parse_markdown(WITH_DETAILS);
    const edited = WITH_DETAILS.replace("Intro paragraph.", "Changed intro.");
    const result = apply_diff(doc, edited);

    expect(details_count(result)).toBe(1);
    expect(result.firstChild?.textContent).toBe("Changed intro.");
  });
});
