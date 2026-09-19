import type { Node as ProseNode } from "prosemirror-model";

function at_line_start(text: string, idx: number): boolean {
  return idx === 0 || text[idx - 1] === "\n";
}

function skip_to_eol(text: string, idx: number): number {
  while (idx < text.length && text[idx] !== "\n") idx++;
  return idx;
}

function skip_blank_lines(text: string, idx: number): number {
  while (idx < text.length && text[idx] === "\n") idx++;
  return idx;
}

function skip_list_marker(text: string, idx: number): number {
  let i = idx;
  while (i < text.length && text[i] === " ") i++;
  if (i >= text.length) return idx;

  const c = text[i]!;
  if (c === "-" || c === "*" || c === "+") {
    if (i + 1 < text.length && text[i + 1] === " ") {
      i += 2;
      if (
        i + 3 < text.length &&
        text[i] === "[" &&
        (text[i + 1] === " " || text[i + 1] === "x" || text[i + 1] === "X") &&
        text[i + 2] === "]" &&
        (text[i + 3] === " " || text[i + 3] === "\t")
      ) {
        i += 4;
      }
      return i;
    }
  }

  if (c >= "0" && c <= "9") {
    let j = i;
    while (j < text.length && text[j]! >= "0" && text[j]! <= "9") j++;
    if (
      j < text.length &&
      text[j] === "." &&
      j + 1 < text.length &&
      text[j + 1] === " "
    ) {
      return j + 2;
    }
  }

  return idx;
}

type OffsetProbe = (text_index: number, md_offset: number) => void;

/**
 * Aligns `text_before` against `markdown`, one character at a time. When
 * `probe` is given it reports the markdown offset reached the first time each
 * text index is included, which is the mapping a truncated walk would return.
 */
function walk_text_to_md(
  text_before: string,
  markdown: string,
  probe: OffsetProbe | null,
): number {
  let ti = 0;
  let mi = 0;
  let in_code_fence = false;
  let in_frontmatter = false;
  let probed_ti = -1;

  while (ti < text_before.length && mi < markdown.length) {
    if (probe !== null && ti !== probed_ti) {
      probed_ti = ti;
      probe(ti, mi);
    }
    if (mi === 0 && !in_frontmatter && markdown.startsWith("---", mi)) {
      const after_dashes = mi + 3;
      if (after_dashes >= markdown.length || markdown[after_dashes] === "\n") {
        in_frontmatter = true;
        mi = after_dashes < markdown.length ? after_dashes + 1 : after_dashes;
        continue;
      }
    }

    if (in_frontmatter) {
      if (at_line_start(markdown, mi) && markdown.startsWith("---", mi)) {
        const end = mi + 3;
        if (end >= markdown.length || markdown[end] === "\n") {
          in_frontmatter = false;
          mi = skip_blank_lines(
            markdown,
            end < markdown.length ? end + 1 : end,
          );
          if (ti < text_before.length && text_before[ti] === "\n") ti++;
          continue;
        }
      }
      if (text_before[ti] === markdown[mi]) {
        ti++;
        mi++;
      } else {
        mi++;
      }
      continue;
    }

    if (
      !in_code_fence &&
      at_line_start(markdown, mi) &&
      markdown.startsWith("```", mi)
    ) {
      in_code_fence = true;
      mi = skip_to_eol(markdown, mi);
      if (mi < markdown.length) mi++;
      continue;
    }

    if (in_code_fence) {
      if (at_line_start(markdown, mi) && markdown.startsWith("```", mi)) {
        in_code_fence = false;
        mi = skip_to_eol(markdown, mi);
        if (mi < markdown.length) mi++;
        mi = skip_blank_lines(markdown, mi);
        if (ti < text_before.length && text_before[ti] === "\n") ti++;
        continue;
      }
      if (text_before[ti] === markdown[mi]) {
        ti++;
        mi++;
      } else if (text_before[ti] === "\n" && markdown[mi] === "\n") {
        ti++;
        mi++;
      } else {
        mi++;
      }
      continue;
    }

    if (at_line_start(markdown, mi) && markdown[mi] === "\n") {
      mi++;
      continue;
    }

    if (at_line_start(markdown, mi)) {
      if (markdown[mi] === "#") {
        let j = mi;
        while (j < markdown.length && markdown[j] === "#") j++;
        if (j < markdown.length && markdown[j] === " ") {
          mi = j + 1;
          continue;
        }
      }

      if (markdown[mi] === ">") {
        mi++;
        if (mi < markdown.length && markdown[mi] === " ") mi++;
        continue;
      }

      if (
        markdown.startsWith("---", mi) &&
        (mi + 3 >= markdown.length || markdown[mi + 3] === "\n")
      ) {
        mi = skip_to_eol(markdown, mi);
        if (mi < markdown.length) mi++;
        continue;
      }

      const list_end = skip_list_marker(markdown, mi);
      if (list_end > mi) {
        mi = list_end;
        continue;
      }
    }

    if (text_before[ti] === "\n") {
      mi = skip_to_eol(markdown, mi);
      if (mi < markdown.length) mi++;
      mi = skip_blank_lines(markdown, mi);

      if (at_line_start(markdown, mi)) {
        const list_end = skip_list_marker(markdown, mi);
        if (list_end > mi) {
          mi = list_end;
        } else if (markdown[mi] === "#") {
          let j = mi;
          while (j < markdown.length && markdown[j] === "#") j++;
          if (j < markdown.length && markdown[j] === " ") mi = j + 1;
        } else if (markdown[mi] === ">") {
          mi++;
          if (mi < markdown.length && markdown[mi] === " ") mi++;
        }
      }

      ti++;
      continue;
    }

    if (text_before[ti] === markdown[mi]) {
      ti++;
      mi++;
    } else {
      mi++;
    }
  }

  if (probe !== null && ti !== probed_ti) probe(ti, mi);
  return Math.min(mi, markdown.length);
}

export function prose_cursor_to_md_offset(
  doc: ProseNode,
  cursor_pos: number,
  markdown: string,
): number {
  if (cursor_pos <= 0 || doc.content.size === 0 || !markdown) return 0;

  const clamped = Math.min(cursor_pos, doc.content.size);
  return walk_text_to_md(doc.textBetween(0, clamped, "\n"), markdown, null);
}

function leaf_text_for(node: ProseNode): string {
  if (node.isText) return node.text ?? "";
  if (!node.isLeaf) return "";
  const spec = node.type.spec.leafText;
  if (!spec) return "";
  return typeof spec === "function" ? spec(node) : spec;
}

/** Reads an offset the index guarantees is in bounds. */
function offset_at(values: Int32Array, index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`offset index ${String(index)} is out of range`);
  }
  return value;
}

/**
 * A positional index over one (doc, markdown) pair, built by a single document
 * walk. `md_offsets[t]` is the markdown offset of the walk truncated to the
 * first `t` characters of the document text, and `prose_positions[t]` is the
 * smallest ProseMirror position that reaches it — exactly what
 * `prose_cursor_to_md_offset` returns for that position.
 *
 * Mapping a diagnostic used to cost one full document walk per binary-search
 * probe, per endpoint; with the index every probe is an array read.
 */
export type OffsetIndex = {
  prose_positions: Int32Array;
  md_offsets: Int32Array;
  /** Markdown offset of each line start; the last entry is the markdown end. */
  line_starts: Int32Array;
  markdown_length: number;
  doc_size: number;
};

function build_line_starts(markdown: string): number[] {
  const starts = [0];
  for (let i = 0; i < markdown.length; i++) {
    if (markdown.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/**
 * Reassembles `doc.textBetween(0, doc.content.size, "\n")` while recording, for
 * every character of it, the first ProseMirror position at which the truncated
 * walk includes that character.
 */
function collect_text_breakpoints(doc: ProseNode): {
  text: string;
  prose_positions: Int32Array;
} {
  const positions: number[] = [0];
  let text = "";
  let first_block = true;

  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    const node_text = leaf_text_for(node);
    if (
      node.isBlock &&
      ((node.isLeaf && node_text !== "") || node.isTextblock)
    ) {
      if (first_block) first_block = false;
      else {
        text += "\n";
        positions[text.length] = pos + 1;
      }
    }
    if (node_text === "") return true;

    const start = text.length;
    text += node_text;
    for (let i = 1; i <= node_text.length; i++) {
      positions[start + i] = node.isText ? pos + i : pos + 1;
    }
    return true;
  });

  return { text, prose_positions: Int32Array.from(positions) };
}

export function build_offset_index(
  doc: ProseNode,
  markdown: string,
): OffsetIndex {
  const { text, prose_positions } = collect_text_breakpoints(doc);
  const md_offsets = new Int32Array(text.length + 1);
  let filled = 0;

  const final_md = walk_text_to_md(text, markdown, (text_index, md_offset) => {
    for (let i = filled; i <= text_index; i++) md_offsets[i] = md_offset;
    filled = text_index + 1;
  });
  for (let i = filled; i <= text.length; i++) md_offsets[i] = final_md;

  return {
    prose_positions,
    md_offsets,
    line_starts: Int32Array.from(build_line_starts(markdown)),
    markdown_length: markdown.length,
    doc_size: doc.content.size,
  };
}

/** `md_offset_to_prose_pos` against a prebuilt index. */
export function md_offset_to_prose_pos_indexed(
  index: OffsetIndex,
  md_offset: number,
): number {
  if (md_offset <= 0 || index.doc_size === 0) return 0;
  if (md_offset >= index.markdown_length) return index.doc_size;

  const { md_offsets, prose_positions } = index;
  let lo = 0;
  let hi = md_offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offset_at(md_offsets, mid) < md_offset) lo = mid + 1;
    else hi = mid;
  }
  return offset_at(md_offsets, lo) < md_offset
    ? index.doc_size
    : offset_at(prose_positions, lo);
}

/** `line_character_from_md_offset`'s inverse against a prebuilt index. */
export function md_offset_from_line_character_indexed(
  index: OffsetIndex,
  line: number,
  character: number,
): number {
  const start =
    line <= 0
      ? 0
      : line < index.line_starts.length
        ? offset_at(index.line_starts, line)
        : index.markdown_length;
  return Math.min(start + character, index.markdown_length);
}

export type BlockAnchor = {
  block_index: number;
  offset_in_block: number;
};

export function prose_cursor_to_block_anchor(
  doc: ProseNode,
  cursor_pos: number,
): BlockAnchor {
  if (cursor_pos <= 0 || doc.content.size === 0) {
    return { block_index: 0, offset_in_block: 0 };
  }

  const clamped = Math.min(cursor_pos, doc.content.size);
  let offset = 0;

  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const block_start = offset + 1;
    const block_end = offset + child.nodeSize;

    if (clamped <= block_end) {
      const offset_in_block = Math.max(0, clamped - block_start);
      return { block_index: i, offset_in_block };
    }

    offset = block_end;
  }

  if (doc.childCount > 0) {
    const last = doc.child(doc.childCount - 1);
    return {
      block_index: doc.childCount - 1,
      offset_in_block: Math.max(0, last.content.size),
    };
  }

  return { block_index: 0, offset_in_block: 0 };
}

export function block_anchor_to_prose_pos(
  doc: ProseNode,
  anchor: BlockAnchor,
): number {
  if (doc.childCount === 0) return 0;

  const idx = Math.min(anchor.block_index, doc.childCount - 1);
  let offset = 0;

  for (let i = 0; i < idx; i++) {
    offset += doc.child(i).nodeSize;
  }

  const block_start = offset + 1;
  const child = doc.child(idx);
  const max_offset = child.content.size;
  const clamped_offset = Math.min(anchor.offset_in_block, max_offset);

  return block_start + clamped_offset;
}

export function md_offset_to_block_anchor(
  markdown: string,
  md_offset: number,
): BlockAnchor {
  if (md_offset <= 0 || !markdown) {
    return { block_index: 0, offset_in_block: 0 };
  }

  const clamped = Math.min(md_offset, markdown.length);
  let block_index = 0;
  let block_start = 0;
  let i = 0;

  while (i < clamped) {
    if (i === 0 && markdown.startsWith("---\n", i)) {
      const end = markdown.indexOf("\n---", i + 3);
      if (end !== -1) {
        const after = end + 4;
        if (clamped <= after) {
          return { block_index, offset_in_block: clamped - i };
        }
        i = after;
        if (i < markdown.length && markdown[i] === "\n") i++;
        block_index++;
        block_start = i;
        continue;
      }
    }

    if (markdown[i] === "\n") {
      let j = i;
      while (j < markdown.length && markdown[j] === "\n") j++;
      if (j - i >= 2) {
        if (clamped <= j) {
          return { block_index, offset_in_block: clamped - block_start };
        }
        i = j;
        block_index++;
        block_start = i;
        continue;
      }
    }

    i++;
  }

  return { block_index, offset_in_block: clamped - block_start };
}

export function block_anchor_to_md_offset(
  markdown: string,
  anchor: BlockAnchor,
): number {
  if (!markdown) return 0;

  let block_index = 0;
  let block_start = 0;
  let i = 0;

  if (i < markdown.length && markdown.startsWith("---\n", i)) {
    const end = markdown.indexOf("\n---", i + 3);
    if (end !== -1) {
      const after = end + 4;
      if (anchor.block_index === 0) {
        return Math.min(block_start + anchor.offset_in_block, after);
      }
      i = after;
      if (i < markdown.length && markdown[i] === "\n") i++;
      block_index++;
      block_start = i;
    }
  }

  while (i < markdown.length && block_index < anchor.block_index) {
    if (markdown[i] === "\n") {
      let j = i;
      while (j < markdown.length && markdown[j] === "\n") j++;
      if (j - i >= 2) {
        i = j;
        block_index++;
        block_start = i;
        continue;
      }
    }
    i++;
  }

  return Math.min(block_start + anchor.offset_in_block, markdown.length);
}

export function md_offset_to_prose_pos(
  doc: ProseNode,
  md_offset: number,
  markdown: string,
): number {
  if (md_offset <= 0 || doc.content.size === 0) return 0;
  if (md_offset >= markdown.length) return doc.content.size;

  let lo = 0;
  let hi = doc.content.size;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const mapped = prose_cursor_to_md_offset(doc, mid, markdown);
    if (mapped < md_offset) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo;
}
