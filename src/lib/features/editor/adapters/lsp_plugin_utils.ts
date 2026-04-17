import type { EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import {
  prose_cursor_to_md_offset,
  md_offset_to_prose_pos,
} from "./cursor_offset_mapper";

export function line_and_character_from_pos(
  view: EditorView,
  pos: number,
  markdown: string,
): { line: number; character: number } {
  const doc = view.state.doc;
  const md_offset = prose_cursor_to_md_offset(doc, pos, markdown);
  return line_character_from_md_offset(markdown, md_offset);
}

export function line_character_from_md_offset(
  markdown: string,
  md_offset: number,
): { line: number; character: number } {
  let line = 0;
  let last_newline = -1;
  for (let i = 0; i < md_offset && i < markdown.length; i++) {
    if (markdown.charCodeAt(i) === 10) {
      line++;
      last_newline = i;
    }
  }
  const character = md_offset - last_newline - 1;
  return { line, character };
}

export function md_offset_from_line_character(
  markdown: string,
  line: number,
  character: number,
): number {
  let current_line = 0;
  let i = 0;
  while (current_line < line && i < markdown.length) {
    if (markdown.charCodeAt(i) === 10) current_line++;
    i++;
  }
  return Math.min(i + character, markdown.length);
}

export function lsp_pos_to_prose_pos(
  doc: ProseNode,
  markdown: string,
  line: number,
  character: number,
): number {
  const md_offset = md_offset_from_line_character(markdown, line, character);
  return md_offset_to_prose_pos(doc, md_offset, markdown);
}
