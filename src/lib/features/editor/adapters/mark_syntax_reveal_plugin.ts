import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type {
  Mark,
  MarkType,
  Node as ProseNode,
  ResolvedPos,
} from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";

export const mark_syntax_reveal_plugin_key =
  new PluginKey<MarkSyntaxRevealState>("mark-syntax-reveal");

const REVEAL_DELIMITERS: ReadonlyArray<readonly [string, string]> = [
  ["strong", "**"],
  ["em", "*"],
  ["strikethrough", "~~"],
  ["highlight", "=="],
  ["code_inline", "`"],
];

const REVEAL_MARK_NAMES = new Set(REVEAL_DELIMITERS.map(([name]) => name));
const REVEAL_DELIMITER_BY_MARK = new Map(REVEAL_DELIMITERS);

export type RevealSpan = {
  from: number;
  to: number;
  mark_name: string;
  delimiter: string;
  order: number;
};

export type MarkSyntaxRevealState = {
  spans: RevealSpan[];
  decorations: DecorationSet;
};

function collect_block_spans(
  block: ProseNode,
  content_start: number,
  sel_from: number,
  sel_to: number,
  schema_marks: EditorState["schema"]["marks"],
  spans: RevealSpan[],
): void {
  for (const [order, [mark_name, delimiter]] of REVEAL_DELIMITERS.entries()) {
    const mark_type = schema_marks[mark_name];
    if (!mark_type) continue;

    let run_start: number | null = null;
    let run_end = 0;
    const push_run = () => {
      if (run_start === null) return;
      const from = content_start + run_start;
      const to = content_start + run_end;
      if (from <= sel_to && to >= sel_from) {
        spans.push({ from, to, mark_name, delimiter, order });
      }
      run_start = null;
    };

    block.forEach((child, offset) => {
      if (mark_type.isInSet(child.marks)) {
        if (run_start === null) run_start = offset;
        run_end = offset + child.nodeSize;
      } else {
        push_run();
      }
    });
    push_run();
  }
}

export function collect_reveal_spans(state: EditorState): RevealSpan[] {
  const { from, to, $from, $to } = state.selection;
  const blocks = new Map<number, ProseNode>();

  for (const $pos of [$from, $to]) {
    if ($pos.depth === 0) continue;
    const block = $pos.parent;
    if (!block.isTextblock || block.type.spec.code) continue;
    blocks.set($pos.start(), block);
  }

  const spans: RevealSpan[] = [];
  for (const [content_start, block] of blocks) {
    collect_block_spans(
      block,
      content_start,
      from,
      to,
      state.schema.marks,
      spans,
    );
  }
  spans.sort((a, b) => a.from - b.from || a.to - b.to);
  return spans;
}

function make_delimiter_widget(text: string): () => HTMLElement {
  return () => {
    const el = document.createElement("span");
    el.className = "mark-syntax-delimiter";
    el.textContent = text;
    return el;
  };
}

function build_decorations(doc: ProseNode, spans: RevealSpan[]): DecorationSet {
  const starts = new Map<number, RevealSpan[]>();
  const ends = new Map<number, RevealSpan[]>();
  const add = (
    map: Map<number, RevealSpan[]>,
    pos: number,
    span: RevealSpan,
  ) => {
    const group = map.get(pos);
    if (group) group.push(span);
    else map.set(pos, [span]);
  };
  for (const span of spans) {
    add(starts, span.from, span);
    add(ends, span.to, span);
  }

  // Keys carry only the delimiter text (not the position) so widget DOM is
  // reused when edits shift positions; the set itself tracks position.
  const decorations: Decoration[] = [];
  for (const [pos, group] of starts) {
    group.sort((a, b) => b.to - a.to || a.order - b.order);
    const text = group.map((s) => s.delimiter).join("");
    decorations.push(
      Decoration.widget(pos, make_delimiter_widget(text), {
        side: 1,
        key: `reveal-start:${text}`,
      }),
    );
  }
  for (const [pos, group] of ends) {
    group.sort((a, b) => b.from - a.from || b.order - a.order);
    const text = group.map((s) => s.delimiter).join("");
    decorations.push(
      Decoration.widget(pos, make_delimiter_widget(text), {
        side: -1,
        key: `reveal-end:${text}`,
      }),
    );
  }
  return DecorationSet.create(doc, decorations);
}

function compute_state(state: EditorState): MarkSyntaxRevealState {
  const spans = collect_reveal_spans(state);
  return { spans, decorations: build_decorations(state.doc, spans) };
}

function spans_equal(a: RevealSpan[], b: RevealSpan[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      !x ||
      !y ||
      x.from !== y.from ||
      x.to !== y.to ||
      x.mark_name !== y.mark_name
    ) {
      return false;
    }
  }
  return true;
}

function find_starting_run_end(
  $cursor: ResolvedPos,
  mark_type: MarkType,
): number {
  const cursor_offset = $cursor.parentOffset;
  const parent = $cursor.parent;
  let run_end = cursor_offset;
  let offset = 0;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const child_end = offset + child.nodeSize;
    if (offset >= cursor_offset) {
      if (!mark_type.isInSet(child.marks)) break;
      run_end = child_end;
    }
    offset = child_end;
  }
  return $cursor.start() + run_end;
}

function reveal_marks_only_on(
  node: ProseNode | null,
  opposite: ProseNode | null,
): readonly Mark[] {
  if (!node) return [];
  return node.marks.filter(
    (m) =>
      REVEAL_MARK_NAMES.has(m.type.name) &&
      (!opposite || !m.type.isInSet(opposite.marks)),
  );
}

// Marks spanning the insertion point are context the orphaned delimiter sits
// inside; marks that merely touch it belong to a neighbouring run.
function boundary_marks(doc: ProseNode, pos: number): Mark[] {
  const $pos = doc.resolve(pos);
  const before = $pos.nodeBefore;
  const after = $pos.nodeAfter;
  if (!before || !after) return [];
  return before.marks.filter((m) => m.isInSet(after.marks));
}

type RevealEdge = {
  mark: Mark;
  from: number;
  to: number;
  orphan_at: number;
};

// Of the marks nested at the cursor, the innermost is the one whose opposite
// run boundary sits closest to it.
function closest_run_boundary(
  marks: readonly Mark[],
  boundary_of: (mark: Mark) => number,
  cursor: number,
): { mark: Mark; pos: number } | null {
  let best: { mark: Mark; pos: number } | null = null;
  for (const mark of marks) {
    const pos = boundary_of(mark);
    if (!best || Math.abs(cursor - pos) < Math.abs(cursor - best.pos)) {
      best = { mark, pos };
    }
  }
  return best;
}

function find_reveal_edge($cursor: ResolvedPos): RevealEdge | null {
  const cursor = $cursor.pos;
  const starting = closest_run_boundary(
    reveal_marks_only_on($cursor.nodeAfter, $cursor.nodeBefore),
    (m) => find_starting_run_end($cursor, m.type),
    cursor,
  );
  if (!starting) return null;
  return {
    mark: starting.mark,
    from: cursor,
    to: starting.pos,
    orphan_at: starting.pos,
  };
}

// Deleting a run's opening delimiter leaves the closing one behind as literal
// text, matching what Obsidian's source-level editing does. At a run's end the
// caret sits *before* the closing delimiter, so backspacing there deletes the
// last character of the run — native behaviour, deliberately not intercepted.
export function handle_reveal_backspace(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const $cursor = selection.$cursor;
  if (!$cursor || $cursor.parent.type.spec.code) return false;

  const edge = find_reveal_edge($cursor);
  if (!edge) return false;

  if (dispatch) {
    const delimiter = REVEAL_DELIMITER_BY_MARK.get(edge.mark.type.name) ?? "";
    dispatch(
      state.tr
        .removeMark(edge.from, edge.to, edge.mark.type)
        .removeStoredMark(edge.mark.type)
        .replaceWith(
          edge.orphan_at,
          edge.orphan_at,
          state.schema.text(
            delimiter,
            boundary_marks(state.doc, edge.orphan_at),
          ),
        ),
    );
  }
  return true;
}

type RunClose = {
  mark: Mark;
  from: number;
};

// A multi-character closing delimiter arrives one keystroke at a time, so its
// leading characters land inside the run as literal text; they are reclaimed
// here once the final character completes the pair.
function find_run_close($cursor: ResolvedPos, input: string): RunClose | null {
  const before = $cursor.nodeBefore;
  if (!before?.isText) return null;

  for (const mark of reveal_marks_only_on(before, $cursor.nodeAfter)) {
    const delimiter = REVEAL_DELIMITER_BY_MARK.get(mark.type.name);
    if (!delimiter || !delimiter.endsWith(input)) continue;
    const partial = delimiter.slice(0, delimiter.length - input.length);
    if (partial && !(before.text ?? "").endsWith(partial)) continue;
    return { mark, from: $cursor.pos - partial.length };
  }
  return null;
}

// Typing a run's closing delimiter at its end exits the run instead of
// inserting the delimiter as text, the way source-level editing behaves.
export function handle_reveal_text_input(
  state: EditorState,
  from: number,
  to: number,
  text: string,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (!text || from !== to) return false;
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;
  const $cursor = selection.$cursor;
  if (!$cursor || $cursor.pos !== from || $cursor.parent.type.spec.code) {
    return false;
  }

  const close = find_run_close($cursor, text);
  if (!close) return false;

  if (dispatch) {
    const tr = state.tr;
    if (close.from < $cursor.pos) tr.delete(close.from, $cursor.pos);
    dispatch(tr.removeStoredMark(close.mark.type));
  }
  return true;
}

export function create_mark_syntax_reveal_plugin(): Plugin {
  return new Plugin<MarkSyntaxRevealState>({
    key: mark_syntax_reveal_plugin_key,
    state: {
      init(_config, state) {
        return compute_state(state);
      },
      apply(tr, prev, _old_state, new_state) {
        if (!tr.docChanged && !tr.selectionSet) return prev;
        if (!tr.docChanged) {
          // Caret moves within the same runs are the common case; returning
          // prev preserves DecorationSet identity so the view skips redraw.
          const spans = collect_reveal_spans(new_state);
          if (spans_equal(spans, prev.spans)) return prev;
          return {
            spans,
            decorations: build_decorations(new_state.doc, spans),
          };
        }
        return compute_state(new_state);
      },
    },
    props: {
      decorations(state) {
        return (
          mark_syntax_reveal_plugin_key.getState(state)?.decorations ??
          DecorationSet.empty
        );
      },
      handleKeyDown(view, event) {
        if (
          event.key !== "Backspace" ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        ) {
          return false;
        }
        return handle_reveal_backspace(view.state, view.dispatch);
      },
      handleTextInput(view, from, to, text) {
        return handle_reveal_text_input(
          view.state,
          from,
          to,
          text,
          view.dispatch,
        );
      },
    },
  });
}
