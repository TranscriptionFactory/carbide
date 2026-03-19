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
