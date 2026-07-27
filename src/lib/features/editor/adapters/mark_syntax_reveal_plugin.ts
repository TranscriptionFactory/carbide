import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type {
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

function find_ending_run_start(
  $cursor: ResolvedPos,
  mark_type: MarkType,
): number {
  const cursor_offset = $cursor.parentOffset;
  const parent = $cursor.parent;
  let current_run_start: number | null = null;
  let offset = 0;
  for (let i = 0; i < parent.childCount && offset < cursor_offset; i++) {
    const child = parent.child(i);
    if (mark_type.isInSet(child.marks)) {
      if (current_run_start === null) current_run_start = offset;
    } else {
      current_run_start = null;
    }
    offset += child.nodeSize;
  }
  return $cursor.start() + (current_run_start ?? cursor_offset);
}

export function handle_reveal_backspace(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const $cursor = selection.$cursor;
  if (!$cursor || $cursor.parent.type.spec.code) return false;

  const node_before = $cursor.nodeBefore;
  if (!node_before) return false;

  const node_after = $cursor.nodeAfter;
  const ending = node_before.marks.filter(
    (m) =>
      REVEAL_MARK_NAMES.has(m.type.name) &&
      (!node_after || !m.type.isInSet(node_after.marks)),
  );
  let innermost = ending[0];
  if (!innermost) return false;

  let innermost_start = find_ending_run_start($cursor, innermost.type);
  for (const mark of ending.slice(1)) {
    const start = find_ending_run_start($cursor, mark.type);
    if (start > innermost_start) {
      innermost = mark;
      innermost_start = start;
    }
  }

  if (dispatch) {
    dispatch(
      state.tr
        .removeMark(innermost_start, $cursor.pos, innermost.type)
        .removeStoredMark(innermost.type),
    );
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
    },
  });
}
