/**
 * @vitest-environment jsdom
 */
//
// The jsdom pragma is load-bearing: `update_prosemirror_diagnostics` publishes
// through a real `EditorView`, and the meter below measures the document work
// that publish performs.
import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import type { Diagnostic } from "$lib/features/diagnostics";
import { parse_markdown } from "$lib/features/editor/adapters/markdown_pipeline";
import { DecorationSet } from "prosemirror-view";
import {
  create_diagnostics_decoration_plugin,
  diagnostics_decoration_plugin_key,
  update_prosemirror_diagnostics,
} from "$lib/features/editor/adapters/diagnostics_decoration_plugin";
import { md_offset_to_prose_pos } from "$lib/features/editor/adapters/cursor_offset_mapper";
import { meter_document_work } from "../helpers/document_work_meter";

const BLOCKS = 3100;
const DIAGNOSTICS = 50;

function big_markdown(): string {
  const lines: string[] = [];
  for (let index = 0; index < BLOCKS; index++) {
    lines.push(
      `block ${String(index)} text with a handful of words inside it to pad the line`,
      "",
    );
  }
  return lines.join("\n");
}

function document_node_count(doc: ProseNode): number {
  let count = 0;
  const walk = (node: ProseNode) => {
    node.forEach((child) => {
      count += 1;
      walk(child);
    });
  };
  walk(doc);
  return count;
}

function make_view(doc: ProseNode): EditorView {
  return new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc,
      plugins: [create_diagnostics_decoration_plugin()],
    }),
  });
}

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

describe("diagnostics publish cost", () => {
  it("maps 50 diagnostics with a single document walk", () => {
    const markdown = big_markdown();
    const doc = parse_markdown(markdown);
    expect(markdown.length).toBeGreaterThan(200_000);

    const editor_view = make_view(doc);
    view = editor_view;
    const diagnostics: Diagnostic[] = Array.from(
      { length: DIAGNOSTICS },
      (_, index) => ({
        source: "markdown_lsp",
        line: index * Math.floor((BLOCKS * 2) / DIAGNOSTICS),
        column: 0,
        end_line: index * Math.floor((BLOCKS * 2) / DIAGNOSTICS),
        end_column: 5,
        severity: "warning",
        message: `diagnostic ${String(index)}`,
        rule_id: null,
        fixable: false,
      }),
    );

    const meter = meter_document_work(doc);
    try {
      update_prosemirror_diagnostics(editor_view, diagnostics, () => markdown);
    } finally {
      meter.stop();
    }

    const nodes = document_node_count(doc);
    // One walk builds the mapping index; the old per-endpoint search ran a
    // full binary search of full-document walks instead. The character metric
    // separates the two: the index reads the document text once (twice with
    // the view's own render), where probing read it hundreds of times.
    expect(meter.counters.nodes).toBeLessThanOrEqual(nodes * 2);
    expect(meter.counters.chars).toBeLessThanOrEqual(markdown.length * 4);
  });

  it("places decorations where the unindexed mapping does", () => {
    const markdown =
      "block one text here\n\nblock two text here\n\nblock three\n";
    const doc = parse_markdown(markdown);
    const editor_view = make_view(doc);
    view = editor_view;

    const diagnostics: Diagnostic[] = [
      {
        source: "markdown_lsp",
        line: 2,
        column: 0,
        end_line: 2,
        end_column: 5,
        severity: "error",
        message: "second block",
        rule_id: null,
        fixable: false,
      },
    ];

    update_prosemirror_diagnostics(editor_view, diagnostics, () => markdown);

    const decorations = (
      diagnostics_decoration_plugin_key.getState(editor_view.state) ??
      DecorationSet.empty
    )
      .find()
      .map((decoration) => [decoration.from, decoration.to]);

    const line_start = markdown.split("\n").slice(0, 2).join("\n").length + 1;
    expect(decorations).toEqual([
      [
        md_offset_to_prose_pos(doc, line_start, markdown),
        md_offset_to_prose_pos(doc, line_start + 5, markdown),
      ],
    ]);
  });
});
