import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Fragment, Mark, Slice } from "prosemirror-model";
import type { Node as ProseNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { Decoration, DecorationSet } from "prosemirror-view";
import { isHistoryTransaction } from "prosemirror-history";
import { PRESENTATION_ONLY_META } from "$lib/features/editor/domain/presentation_only_meta";
import {
  parse_markdown,
  schema,
  serialize_markdown,
} from "./markdown_pipeline";
import {
  collect_block_spans,
  type RevealSpan,
} from "./mark_syntax_reveal_plugin";
import {
  inline_units,
  match_subsequence,
  rewrite_inline_content,
} from "./inline_content_transform";

export const source_in_place_plugin_key = new PluginKey<SourceInPlaceState>(
  "source-in-place",
);

type Range = { from: number; to: number };

export type SourceInPlaceState = {
  region: Range | null;
  decorations: DecorationSet;
};

type SourceInPlaceMeta = { region: Range | null };

type EnterPlan = {
  block_pos: number;
  target: Fragment;
  span: Range;
  raw: string;
};

type ExitPlan = {
  block_pos: number;
  target: Fragment;
  byte_identical: boolean;
};

const md_source = schema.marks.md_source;

const SOURCE_TAG_BY_MARK: Record<string, string> = {
  strong: "strong",
  em: "em",
  strikethrough: "del",
  highlight: "mark",
  code_inline: "code",
};

function serialize_block(block: ProseNode, content: Fragment): string {
  return serialize_markdown(schema.nodes.doc.create(null, block.copy(content)));
}

function is_source_block($pos: ReturnType<ProseNode["resolve"]>): boolean {
  return $pos.depth === 1 && $pos.parent.type === schema.nodes.paragraph;
}

// Runs touching the caret, grown over every run they overlap so a nested or
// interleaved group (`***a* b**`) converts as one piece of source.
function touched_span(spans: RevealSpan[], pos: number): Range | null {
  const touching = spans.filter((s) => s.from <= pos && pos <= s.to);
  if (touching.length === 0) return null;
  let from = Math.min(...touching.map((s) => s.from));
  let to = Math.max(...touching.map((s) => s.to));
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of spans) {
      if (s.from < to && s.to > from && (s.from < from || s.to > to)) {
        from = Math.min(from, s.from);
        to = Math.max(to, s.to);
        grew = true;
      }
    }
  }
  return { from, to };
}

function shared_context_marks(content: Fragment): readonly Mark[] {
  let shared: readonly Mark[] | null = null;
  content.forEach((node) => {
    shared = (shared ?? node.marks).filter(
      (m) => !(m.type.name in SOURCE_TAG_BY_MARK) && m.isInSet(node.marks),
    );
  });
  return shared ?? [];
}

function strip_marks(content: Fragment, marks: readonly Mark[]): Fragment {
  const nodes: ProseNode[] = [];
  content.forEach((node) => {
    nodes.push(node.mark(node.marks.filter((m) => !m.isInSet(marks))));
  });
  return Fragment.from(nodes);
}

function is_plain_text(content: Fragment): boolean {
  let plain = true;
  content.forEach((node) => {
    if (!node.isText) plain = false;
  });
  return plain;
}

function plan_enter(doc: ProseNode, pos: number): EnterPlan | null {
  const $pos = doc.resolve(pos);
  if (!is_source_block($pos)) return null;
  const block = $pos.parent;
  const content_start = $pos.start();
  const spans: RevealSpan[] = [];
  collect_block_spans(block, content_start, schema.marks, spans);
  const span = touched_span(spans, pos);
  if (!span) return null;

  const run = block.content.cut(
    span.from - content_start,
    span.to - content_start,
  );
  if (!is_plain_text(run)) return null;

  const original = serialize_block(block, block.content);
  for (const context of [shared_context_marks(run), Mark.none]) {
    const raw = serialize_block(block, strip_marks(run, context)).replace(
      /\n$/,
      "",
    );
    if (!raw || raw.includes("\n")) continue;
    const target = block.content
      .cut(0, span.from - content_start)
      .append(Fragment.from(schema.text(raw, [...context, md_source.create()])))
      .append(block.content.cut(span.to - content_start));
    if (serialize_block(block, target) === original) {
      return { block_pos: $pos.before(), target, span, raw };
    }
  }
  return null;
}

function without_source_marks(content: Fragment): Fragment {
  const nodes: ProseNode[] = [];
  content.forEach((node) => {
    nodes.push(node.mark(md_source.removeFromSet(node.marks)));
  });
  return Fragment.from(nodes);
}

function with_marks(content: Fragment, marks: readonly Mark[]): Fragment {
  const nodes: ProseNode[] = [];
  content.forEach((node) => {
    nodes.push(
      node.mark(marks.reduce((set, m) => m.addToSet(set), node.marks)),
    );
  });
  return Fragment.from(nodes);
}

// Source that no longer parses as a single paragraph stays literal text, so
// nothing visible is lost.
function reparse_source(nodes: ProseNode[]): Fragment {
  const source = Fragment.from(nodes);
  const parsed = parse_markdown(nodes.map((n) => n.text ?? "").join(""));
  const only = parsed.childCount === 1 ? parsed.firstChild : null;
  if (only?.type !== schema.nodes.paragraph) {
    return without_source_marks(source);
  }
  return with_marks(
    only.content,
    md_source.removeFromSet(nodes[0]?.marks ?? Mark.none),
  );
}

// Each run of source text is re-parsed on its own and spliced back inside the
// marks it sat in. Parsing the whole paragraph instead would lose constructs
// whose definitions live elsewhere in the note (footnote references,
// reference-style links).
function plan_block_exit(block: ProseNode, block_pos: number): ExitPlan {
  const target = normalize_source_fragment(block.content);
  return {
    block_pos,
    target,
    byte_identical:
      serialize_block(block, target) === serialize_block(block, block.content),
  };
}

function normalize_source_fragment(content: Fragment): Fragment {
  const parts: ProseNode[] = [];
  let run: ProseNode[] = [];
  const flush = () => {
    if (run.length === 0) return;
    reparse_source(run).forEach((node) => parts.push(node));
    run = [];
  };
  content.forEach((node) => {
    if (node.isText && md_source.isInSet(node.marks)) {
      run.push(node);
      return;
    }
    flush();
    parts.push(
      node.isLeaf ? node : node.copy(normalize_source_fragment(node.content)),
    );
  });
  flush();
  return Fragment.from(parts);
}

function has_source_text(block: ProseNode): boolean {
  let found = false;
  block.forEach((child) => {
    if (md_source.isInSet(child.marks)) found = true;
  });
  return found;
}

function plan_exit(doc: ProseNode, region: Range): ExitPlan[] {
  const plans: ExitPlan[] = [];
  doc.nodesBetween(region.from, region.to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (has_source_text(node)) plans.push(plan_block_exit(node, pos));
    return false;
  });
  return plans;
}

function find_raw_extent(doc: ProseNode, window: Range): Range | null {
  let from: number | null = null;
  let to = 0;
  doc.nodesBetween(window.from, window.to, (node, pos) => {
    if (!node.isText || !md_source.isInSet(node.marks)) return true;
    from = from === null ? pos : Math.min(from, pos);
    to = Math.max(to, pos + node.nodeSize);
    return false;
  });
  return from === null ? null : { from, to };
}

function touches(selection: Range, region: Range): boolean {
  return selection.from <= region.to && selection.to >= region.from;
}

function source_runs(
  doc: ProseNode,
  region: Range,
): Array<Range & { nodes: ProseNode[] }> {
  const runs: Array<Range & { nodes: ProseNode[] }> = [];
  doc.nodesBetween(region.from, region.to, (node, pos) => {
    if (!node.isText) return true;
    if (!md_source.isInSet(node.marks)) return false;
    const last = runs[runs.length - 1];
    if (last && last.to === pos) {
      last.to = pos + node.nodeSize;
      last.nodes.push(node);
    } else {
      runs.push({ from: pos, to: pos + node.nodeSize, nodes: [node] });
    }
    return false;
  });
  return runs;
}

// Styles the literal source the way Obsidian does: the formatted content keeps
// its look, the syntax characters are dimmed. Each character is classified by
// re-parsing the run and matching the parsed text back onto the source.
function run_decorations(run: Range & { nodes: ProseNode[] }): Decoration[] {
  const raw_units = inline_units(Fragment.from(run.nodes));
  const raw = raw_units.map((u) => u.char ?? "").join("");
  const parsed = parse_markdown(raw).firstChild;
  if (!parsed || parsed.type !== schema.nodes.paragraph) return [];
  const matched = match_subsequence(inline_units(parsed.content), raw_units);
  if (!matched) return [];

  const marks_at: Array<readonly Mark[] | null> = raw_units.map(() => null);
  const parsed_units = inline_units(parsed.content);
  matched.forEach((raw_index, parsed_index) => {
    marks_at[raw_index] = parsed_units[parsed_index]?.node.marks ?? null;
  });

  const decorations: Decoration[] = [];
  raw_units.forEach((_unit, i) => {
    const at = run.from + i;
    const marks = marks_at[i];
    if (!marks) {
      decorations.push(
        Decoration.inline(at, at + 1, { class: "md-source-syntax" }),
      );
      return;
    }
    for (const mark of marks) {
      const tag = SOURCE_TAG_BY_MARK[mark.type.name];
      if (tag)
        decorations.push(Decoration.inline(at, at + 1, { nodeName: tag }));
    }
  });
  return decorations;
}

function build_decorations(
  doc: ProseNode,
  region: Range | null,
): DecorationSet {
  if (!region) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    source_runs(doc, region).flatMap(run_decorations),
  );
}

// Leaves the raw region when the selection no longer touches it (or always,
// with `force_exit`), then converts the run under an empty caret to source.
// Neither half is an edit: both stay out of undo history.
export function build_source_transition(
  state: EditorState,
  force_exit = false,
): Transaction | null {
  const region = source_in_place_plugin_key.getState(state)?.region ?? null;
  const tr = state.tr;
  let byte_identical = true;
  let next_region: Range | null = region;

  if (region && (force_exit || !touches(state.selection, region))) {
    for (const plan of plan_exit(state.doc, region).reverse()) {
      rewrite_inline_content(tr, plan.block_pos, plan.target);
      byte_identical &&= plan.byte_identical;
    }
    next_region = null;
  }

  if (!next_region && !force_exit && tr.selection.empty) {
    const head = tr.selection.head;
    const plan = plan_enter(tr.doc, head);
    if (plan) {
      const steps_before = tr.steps.length;
      rewrite_inline_content(tr, plan.block_pos, plan.target);
      const enter_mapping = tr.mapping.slice(steps_before);
      const from = enter_mapping.map(plan.span.from, -1);
      next_region = { from, to: from + plan.raw.length };
      const caret = enter_mapping.map(head, head === plan.span.from ? -1 : 1);
      tr.setSelection(TextSelection.create(tr.doc, caret));
    }
  }

  if (!tr.docChanged) return null;
  const meta: SourceInPlaceMeta = { region: next_region };
  tr.setMeta(source_in_place_plugin_key, meta).setMeta("addToHistory", false);
  if (byte_identical) tr.setMeta(PRESENTATION_ONLY_META, true);
  return tr;
}

function map_region(
  tr: Transaction,
  prev: Range,
  doc: ProseNode,
): Range | null {
  return find_raw_extent(doc, {
    from: tr.mapping.map(prev.from, -1),
    to: tr.mapping.map(prev.to, 1),
  });
}

export function normalize_source_in_place(
  view: EditorView,
): Transaction | null {
  const tr = build_source_transition(view.state, true);
  if (tr) view.dispatch(tr);
  return tr;
}

// `md_source` is not inclusive, so text pasted at a run's edge would fall
// outside the run and skip the re-parse on exit.
function insert_source_text(
  state: EditorState,
  text: string,
  from: number,
  to: number,
): Transaction {
  const $from = state.doc.resolve(from);
  const source_node = [$from.nodeBefore, $from.nodeAfter].find(
    (node) => node?.isText && md_source.isInSet(node.marks),
  );
  const marks = source_node?.marks ?? [md_source.create()];
  return state.tr.replaceWith(from, to, schema.text(text, marks));
}

function is_source_command_key(event: KeyboardEvent): boolean {
  if (!(event.metaKey || event.ctrlKey)) return false;
  const key = event.key.toLowerCase();
  if (event.altKey) return key === "h";
  return (
    ["z", "y", "b", "i", "e"].includes(key) ||
    (event.shiftKey && ["x", "d", "0", "1", "2", "3"].includes(key))
  );
}

export function create_source_in_place_plugin(): Plugin<SourceInPlaceState> {
  // A transaction that reshapes the text under an active IME composition
  // aborts it, so conversions wait for compositionend.
  let composing = false;

  return new Plugin<SourceInPlaceState>({
    key: source_in_place_plugin_key,
    state: {
      init() {
        return { region: null, decorations: DecorationSet.empty };
      },
      apply(tr, prev, _old_state, new_state) {
        const meta = tr.getMeta(source_in_place_plugin_key) as
          | SourceInPlaceMeta
          | undefined;
        if (meta) {
          return {
            region: meta.region,
            decorations: build_decorations(new_state.doc, meta.region),
          };
        }
        if (!tr.docChanged || !prev.region) return prev;
        const region = map_region(tr, prev.region, new_state.doc);
        return {
          region,
          decorations: composing
            ? prev.decorations.map(tr.mapping, new_state.doc)
            : build_decorations(new_state.doc, region),
        };
      },
    },
    appendTransaction(transactions, _old_state, state) {
      if (composing) return null;
      if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) {
        return null;
      }
      if (
        transactions.some(
          (tr) =>
            isHistoryTransaction(tr) || tr.getMeta(source_in_place_plugin_key),
        )
      ) {
        return null;
      }
      return build_source_transition(state);
    },
    props: {
      decorations(state) {
        return (
          source_in_place_plugin_key.getState(state)?.decorations ??
          DecorationSet.empty
        );
      },
      transformCopied(slice) {
        return new Slice(
          normalize_source_fragment(slice.content),
          slice.openStart,
          slice.openEnd,
        );
      },
      // Commands must see formatting, not its stand-in source text.
      handleKeyDown(view, event) {
        if (!is_source_command_key(event)) return false;
        normalize_source_in_place(view);
        return false;
      },
      // Source is typed verbatim: no input rules, auto-pairing or run exits.
      handleTextInput(view, from, to, text) {
        if (view.composing) return false;
        const region = source_in_place_plugin_key.getState(view.state)?.region;
        if (!region || !touches({ from, to }, region)) return false;
        view.dispatch(view.state.tr.insertText(text, from, to));
        return true;
      },
      handlePaste(view, event) {
        const region = source_in_place_plugin_key.getState(view.state)?.region;
        const { from, to } = view.state.selection;
        if (!region || from < region.from || to > region.to) return false;
        const text = event.clipboardData?.getData("text/plain");
        if (text && !/[\r\n]/.test(text)) {
          view.dispatch(insert_source_text(view.state, text, from, to));
          return true;
        }
        normalize_source_in_place(view);
        return false;
      },
      handleDOMEvents: {
        compositionstart() {
          composing = true;
          return false;
        },
        compositionend() {
          composing = false;
          return false;
        },
      },
    },
  });
}
