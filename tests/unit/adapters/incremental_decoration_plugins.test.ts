import { describe, expect, it, vi } from "vitest";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { Fragment, Slice } from "prosemirror-model";
import type { MarkType, NodeType } from "prosemirror-model";
import type { Node as ProseNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import { history, redo, undo } from "prosemirror-history";
import { schema } from "$lib/features/editor/adapters/schema";
import { parse_markdown } from "$lib/features/editor/adapters/markdown_pipeline";
import { find_inline_tag_ranges } from "$lib/features/editor/domain/tag_ranges";
import {
  block_id_decoration_plugin_key,
  build_block_id_decorations,
  create_block_id_decoration_plugin,
} from "$lib/features/editor/adapters/block_id_decoration_plugin";
import {
  create_tag_pill_prose_plugin,
  tag_pill_plugin_key,
} from "$lib/features/editor/adapters/tag_pill_plugin";
import {
  build_task_decorations,
  create_task_decoration_plugin,
  task_decoration_plugin_key,
} from "$lib/features/editor/adapters/task_decoration_plugin";
import {
  meter_document_work,
  type WorkCounters,
} from "../helpers/document_work_meter";

const MARKDOWN = `# Heading ^head1

para one #alpha text ^abc123

para two plain ^mid789

- [ ] task one @2024-06-20 #beta
  - [ ] sub task @2024-06-21
- [x] task two due: 2024-01-01

final para #gamma ^def456
`;

function snapshot(set: DecorationSet): string[] {
  return set
    .find()
    .map(
      (decoration) =>
        `${String(decoration.from)}-${String(decoration.to)}-${JSON.stringify(
          decoration.spec,
        )}`,
    );
}

function node_type(name: string): NodeType {
  const type = schema.nodes[name];
  if (!type) throw new Error(`missing node type ${name}`);
  return type;
}

function mark_type(name: string): MarkType {
  const type = schema.marks[name];
  if (!type) throw new Error(`missing mark type ${name}`);
  return type;
}

function find_pos(doc: ProseNode, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (!node.isText || typeof node.text !== "string") return true;
    const index = node.text.indexOf(text);
    if (index >= 0) {
      found = pos + index;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`missing text ${text}`);
  return found;
}

function full_tag_decorations(doc: ProseNode): DecorationSet {
  const ranges = find_inline_tag_ranges(doc);
  return DecorationSet.create(
    doc,
    ranges.map((range) =>
      Decoration.inline(range.from, range.to, {
        class: "tag-pill",
        "data-tag": range.tag,
      }),
    ),
  );
}

type PluginCase = {
  name: string;
  plugin: () => Plugin;
  decorations: (state: EditorState) => DecorationSet;
  expected: (state: EditorState) => DecorationSet;
};

const block_id_case: PluginCase = {
  name: "block id",
  plugin: create_block_id_decoration_plugin,
  decorations: (state) =>
    block_id_decoration_plugin_key.getState(state) as DecorationSet,
  expected: (state) => build_block_id_decorations(state),
};

const PLUGIN_CASES: PluginCase[] = [
  block_id_case,
  {
    name: "tag pill",
    plugin: create_tag_pill_prose_plugin,
    decorations: (state) =>
      tag_pill_plugin_key.getState(state)?.decorations as DecorationSet,
    expected: (state) => full_tag_decorations(state.doc),
  },
  {
    name: "task decoration",
    plugin: create_task_decoration_plugin,
    decorations: (state) =>
      task_decoration_plugin_key.getState(state) as DecorationSet,
    expected: (state) => build_task_decorations(state.doc),
  },
];

function make_state(plugin: Plugin): EditorState {
  const doc = parse_markdown(MARKDOWN);
  return EditorState.create({ doc, plugins: [history(), plugin] });
}

function run_command(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

function task_item_pos(state: EditorState): number {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.type.name !== "list_item") return true;
    if (!node.textContent.includes("task one")) return true;
    found = pos;
    return false;
  });
  if (found < 0) throw new Error("missing task item");
  return found;
}

function list_slice(markdown: string): Slice {
  return new Slice(Fragment.from(parse_markdown(markdown).content), 0, 0);
}

type Scenario = { name: string; run: (state: EditorState) => EditorState };

const SCENARIOS: Scenario[] = [
  {
    name: "insert inside a block",
    run: (state) =>
      state.apply(state.tr.insertText("X", find_pos(state.doc, "text") + 2)),
  },
  {
    name: "delete across a block boundary",
    run: (state) =>
      state.apply(
        state.tr.delete(
          find_pos(state.doc, "text") + 2,
          find_pos(state.doc, "final para") + 4,
        ),
      ),
  },
  {
    name: "delete a whole block",
    run: (state) => {
      const start = find_pos(state.doc, "final para") - 1;
      const end = start + state.doc.child(state.doc.childCount - 1).nodeSize;
      return state.apply(state.tr.delete(start, end));
    },
  },
  {
    name: "split a block",
    run: (state) =>
      state.apply(state.tr.split(find_pos(state.doc, "alpha") + 2)),
  },
  {
    name: "join two blocks",
    run: (state) =>
      state.apply(state.tr.join(find_pos(state.doc, "para two") - 1)),
  },
  {
    name: "paste across blocks",
    run: (state) => {
      const from = find_pos(state.doc, "text") + 2;
      const to = find_pos(state.doc, "task two") + 4;
      const tr = state.tr
        .setSelection(TextSelection.create(state.doc, from, to))
        .replaceSelection(list_slice("pasted #delta ^past1\n\nmore ^past2\n"));
      return state.apply(tr);
    },
  },
  {
    name: "add a code_inline mark over a tag",
    run: (state) => {
      const from = find_pos(state.doc, "#beta") - 1;
      return state.apply(
        state.tr.addMark(from, from + 6, mark_type("code_inline").create()),
      );
    },
  },
  {
    name: "add then remove a mark",
    run: (state) => {
      const from = find_pos(state.doc, "alpha");
      const marked = state.apply(
        state.tr.addMark(from, from + 5, mark_type("strong").create()),
      );
      return marked.apply(
        marked.tr.removeMark(from, from + 5, mark_type("strong")),
      );
    },
  },
  {
    name: "insert inside a parent task item",
    run: (state) =>
      state.apply(
        state.tr.insertText("X", find_pos(state.doc, "task one") + 4),
      ),
  },
  {
    name: "toggle a task attribute (empty step map)",
    run: (state) => {
      const pos = task_item_pos(state);
      const node = state.doc.nodeAt(pos);
      if (!node) throw new Error("missing task item");
      return state.apply(
        state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          checked: true,
          task_status: "done",
        }),
      );
    },
  },
  {
    name: "meta-only transaction",
    run: (state) =>
      state.apply(state.tr.setMeta("test-meta", { touched: true })),
  },
  {
    name: "caret move",
    run: (state) =>
      state.apply(
        state.tr.setSelection(
          TextSelection.create(
            state.doc,
            find_pos(state.doc, "final para") + 3,
          ),
        ),
      ),
  },
  {
    name: "range selection across blocks",
    run: (state) =>
      state.apply(
        state.tr.setSelection(
          TextSelection.create(
            state.doc,
            find_pos(state.doc, "alpha") + 1,
            find_pos(state.doc, "final para") + 2,
          ),
        ),
      ),
  },
  {
    name: "undo",
    run: (state) => {
      const edited = state.apply(
        state.tr.insertText("Z", find_pos(state.doc, "text") + 1),
      );
      return run_command(edited, undo);
    },
  },
  {
    name: "redo",
    run: (state) => {
      const edited = state.apply(
        state.tr.insertText("Z", find_pos(state.doc, "text") + 1),
      );
      const undone = run_command(edited, undo);
      return run_command(undone, redo);
    },
  },
];

describe("incremental decoration plugins", () => {
  for (const plugin_case of PLUGIN_CASES) {
    it(`${plugin_case.name}: matches a full rebuild for every edit shape`, () => {
      for (const scenario of SCENARIOS) {
        const state = scenario.run(make_state(plugin_case.plugin()));
        expect(
          snapshot(plugin_case.decorations(state)),
          `${plugin_case.name} / ${scenario.name}`,
        ).toEqual(snapshot(plugin_case.expected(state)));
      }
    });
  }
});

describe("block id selection tracking", () => {
  const case_def = block_id_case;

  function ids_hidden(state: EditorState): string[] {
    return case_def
      .decorations(state)
      .find()
      .map((decoration) =>
        state.doc.textBetween(decoration.from, decoration.to),
      );
  }

  it("re-hides the old caret block and reveals the new one", () => {
    const state = make_state(case_def.plugin());
    const in_middle = state.apply(
      state.tr.setSelection(
        TextSelection.create(state.doc, find_pos(state.doc, "text") + 1),
      ),
    );
    expect(ids_hidden(in_middle)).not.toContain(" ^abc123");

    const moved = in_middle.apply(
      in_middle.tr.setSelection(
        TextSelection.create(
          in_middle.doc,
          find_pos(in_middle.doc, "final") + 1,
        ),
      ),
    );
    const hidden = ids_hidden(moved);
    expect(hidden).toContain(" ^abc123");
    expect(hidden).not.toContain(" ^def456");
  });

  it("hides the ids of the blocks a range selection reaches", () => {
    const state = make_state(case_def.plugin());
    const in_middle = state.apply(
      state.tr.setSelection(
        TextSelection.create(state.doc, find_pos(state.doc, "text") + 1),
      ),
    );
    expect(ids_hidden(in_middle)).not.toContain(" ^abc123");

    const selected = in_middle.apply(
      in_middle.tr.setSelection(
        TextSelection.create(
          in_middle.doc,
          find_pos(in_middle.doc, "Heading") + 1,
          find_pos(in_middle.doc, "final para") + 2,
        ),
      ),
    );
    expect(ids_hidden(selected)).toEqual([
      " ^head1",
      " ^abc123",
      " ^mid789",
      " ^def456",
    ]);
  });
});

function padded(index: number): string {
  return String(index).padStart(4, "0");
}

function notes(count: number): ProseNode[] {
  return Array.from({ length: count }, (_, index) =>
    node_type("paragraph").create(
      null,
      schema.text(`note ${padded(index)} #t ^id${padded(index)}`),
    ),
  );
}

function note_doc(count: number): ProseNode {
  return node_type("doc").create(null, notes(count));
}

function task_doc(count: number): ProseNode {
  const item = node_type("list_item").create(
    { checked: false, task_status: "todo" },
    node_type("paragraph").create(
      null,
      schema.text(`- [ ] task ${padded(count - 1)} @2024-06-20`),
    ),
  );
  return node_type("doc").create(null, [
    ...notes(count),
    node_type("bullet_list").create(null, [item]),
  ]);
}

/**
 * Document work of the plugin, with the cost prosemirror-model itself pays for
 * the transaction subtracted: the meter is run once without the plugin and once
 * with it, so only the scan's own visits and character reads remain.
 */
function plugin_cost(
  doc: ProseNode,
  plugin: Plugin,
  edit: (state: EditorState) => void,
): WorkCounters {
  const run = (plugins: Plugin[]): WorkCounters => {
    const state = EditorState.create({ doc, plugins });
    const parked = state.apply(
      state.tr.setSelection(TextSelection.create(doc, doc.content.size - 1)),
    );
    const meter = meter_document_work(parked.doc);
    try {
      edit(parked);
    } finally {
      meter.stop();
    }
    return { ...meter.counters };
  };

  const baseline = run([]);
  const measured = run([plugin]);
  return {
    nodes: measured.nodes - baseline.nodes,
    chars: measured.chars - baseline.chars,
  };
}

function keystroke(doc: ProseNode, plugin: Plugin, pos: number): WorkCounters {
  return plugin_cost(doc, plugin, (state) => {
    state.apply(state.tr.insertText("x", pos));
  });
}

describe("one-keystroke cost", () => {
  it("block id: scans only the touched block of a 5k-block note", () => {
    const big = note_doc(5000);
    const cost = keystroke(
      big,
      create_block_id_decoration_plugin(),
      find_pos(big, "note 4999 ") + 8,
    );

    // One block of text, three nodes: the 5k untouched blocks are not read.
    expect(cost.nodes).toBeLessThan(12);
    expect(cost.chars).toBeLessThan(256);
  });

  it("tag pill: scans only the touched block of a 5k-block note", () => {
    const big = note_doc(5000);
    const cost = keystroke(
      big,
      create_tag_pill_prose_plugin(),
      find_pos(big, "note 4999 ") + 8,
    );

    expect(cost.nodes).toBeLessThan(12);
    expect(cost.chars).toBeLessThan(256);
  });

  it("task decoration: scans only the touched task item of a 5k-block note", () => {
    const big = task_doc(5000);
    const cost = keystroke(
      big,
      create_task_decoration_plugin(),
      find_pos(big, "task 4999 ") + 5,
    );

    // The touched item plus the walk of its own subtree for nested tasks.
    expect(cost.nodes).toBeLessThan(16);
    expect(cost.chars).toBeLessThan(256);
  });

  it("removes stale decorations through a bounded find, never a full scan", () => {
    const find = vi.spyOn(DecorationSet.prototype, "find");
    try {
      for (const plugin_case of PLUGIN_CASES) {
        const state = make_state(plugin_case.plugin());
        find.mockClear();
        state.apply(
          state.tr.insertText("x", find_pos(state.doc, "task one") + 2),
        );
        expect(find, plugin_case.name).toHaveBeenCalled();
        for (const [from, to] of find.mock.calls) {
          expect(from, plugin_case.name).toBeTypeOf("number");
          expect(to, plugin_case.name).toBeTypeOf("number");
        }
      }
    } finally {
      find.mockRestore();
    }
  });

  it("caret-only moves leave the tag and task scans untouched", () => {
    const doc = note_doc(5000);
    const caret = find_pos(doc, "note 4999 ") + 8;
    for (const plugin of [
      create_tag_pill_prose_plugin(),
      create_task_decoration_plugin(),
    ]) {
      const cost = plugin_cost(doc, plugin, (state) => {
        state.apply(state.tr.setSelection(TextSelection.create(doc, caret)));
      });
      // No nodes, and no block of text beyond the transaction's own core cost.
      expect(cost.nodes).toBe(0);
      expect(cost.chars).toBeLessThan(64);
    }
  });

  it("caret-only move in the block id scan touches at most two blocks", () => {
    const doc = note_doc(5000);
    const caret = find_pos(doc, "note 4999 ") + 8;
    const cost = plugin_cost(
      doc,
      create_block_id_decoration_plugin(),
      (state) => {
        state.apply(state.tr.setSelection(TextSelection.create(doc, caret)));
      },
    );

    expect(cost.nodes).toBeLessThan(12);
    expect(cost.chars).toBeLessThan(256);
  });
});
