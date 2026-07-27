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

const MARK_ORDER = new Map(REVEAL_DELIMITERS.map(([name], i) => [name, i]));

export type RevealSpan = {
  from: number;
  to: number;
  mark_name: string;
  delimiter: string;
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
  for (const [mark_name, delimiter] of REVEAL_DELIMITERS) {
    const mark_type = schema_marks[mark_name];
    if (!mark_type) continue;

    let run_start: number | null = null;
    let run_end = 0;
    const push_run = () => {
      if (run_start === null) return;
      const from = content_start + run_start;
      const to = content_start + run_end;
      if (from <= sel_to && to >= sel_from) {
        spans.push({ from, to, mark_name, delimiter });
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

function mark_order(name: string): number {
  return MARK_ORDER.get(name) ?? REVEAL_DELIMITERS.length;
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

  const decorations: Decoration[] = [];
  for (const [pos, group] of starts) {
    group.sort(
      (a, b) =>
        b.to - a.to || mark_order(a.mark_name) - mark_order(b.mark_name),
    );
    const text = group.map((s) => s.delimiter).join("");
    decorations.push(
      Decoration.widget(pos, make_delimiter_widget(text), {
        side: 1,
        key: `reveal-start:${String(pos)}:${text}`,
      }),
    );
  }
  for (const [pos, group] of ends) {
    group.sort(
      (a, b) =>
        b.from - a.from || mark_order(b.mark_name) - mark_order(a.mark_name),
    );
    const text = group.map((s) => s.delimiter).join("");
    decorations.push(
      Decoration.widget(pos, make_delimiter_widget(text), {
        side: -1,
        key: `reveal-end:${String(pos)}:${text}`,
      }),
    );
  }
  return DecorationSet.create(doc, decorations);
}

function compute_state(state: EditorState): MarkSyntaxRevealState {
  const spans = collect_reveal_spans(state);
  return { spans, decorations: build_decorations(state.doc, spans) };
}

function find_ending_run_start(
  $cursor: ResolvedPos,
  mark_type: MarkType,
): number {
  const cursor_offset = $cursor.parentOffset;
  let current_run_start: number | null = null;
  $cursor.parent.forEach((child, offset) => {
    if (offset >= cursor_offset) return;
    if (mark_type.isInSet(child.marks)) {
      if (current_run_start === null) current_run_start = offset;
    } else {
      current_run_start = null;
    }
  });
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

  const reveal_names = new Set(REVEAL_DELIMITERS.map(([name]) => name));
  const node_after = $cursor.nodeAfter;
  const ending = node_before.marks.filter(
    (m) =>
      reveal_names.has(m.type.name) &&
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
