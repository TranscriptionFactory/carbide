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

export function prose_cursor_to_md_offset(
  doc: ProseNode,
  cursor_pos: number,
  markdown: string,
): number {
  if (cursor_pos <= 0 || doc.content.size === 0 || !markdown) return 0;

  const clamped = Math.min(cursor_pos, doc.content.size);
  const text_before = doc.textBetween(0, clamped, "\n");

  let ti = 0;
  let mi = 0;
  let in_code_fence = false;
  let in_frontmatter = false;

  while (ti < text_before.length && mi < markdown.length) {
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

  return Math.min(mi, markdown.length);
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
