import type { EditorState, Transaction } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { format_wiki_display } from "$lib/features/editor/domain/wiki_link";

export const BLOCK_ID_PATTERN = /(?:^|\s)\^([a-zA-Z0-9-]+)\s*$/;
const BLOCK_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const BLOCK_ID_LENGTH = 6;

export type BlockIdMatch = { text: string; block_id: string; line: number };

type AnchorHost = { node: ProseNode; pos: number };

export function parse_block_ids(markdown: string): BlockIdMatch[] {
  const results: BlockIdMatch[] = [];
  markdown.split("\n").forEach((line, index) => {
    const match = BLOCK_ID_PATTERN.exec(line);
    if (!match?.[1]) return;
    results.push({
      text: line.slice(0, match.index).trim(),
      block_id: match[1],
      line: index + 1,
    });
  });
  return results;
}

export function generate_block_id(): string {
  let id = "";
  for (let i = 0; i < BLOCK_ID_LENGTH; i++) {
    const index = Math.floor(Math.random() * BLOCK_ID_ALPHABET.length);
    id += BLOCK_ID_ALPHABET[index];
  }
  return id;
}

export function format_block_link(note_path: string, block_id: string): string {
  return `[[${format_wiki_display(note_path)}#^${block_id}]]`;
}

export function read_block_id(node: ProseNode): string | null {
  return BLOCK_ID_PATTERN.exec(node.textContent)?.[1] ?? null;
}

export function block_supports_id(doc: ProseNode, pos: number): boolean {
  return resolve_anchor_host(doc, pos) !== null;
}

export function ensure_block_id_at(
  state: EditorState,
  pos: number,
  dispatch: (tr: Transaction) => void,
): string | null {
  const host = resolve_anchor_host(state.doc, pos);
  if (!host) return null;

  const existing = read_block_id(host.node);
  if (existing) return existing;

  const block_id = generate_block_id();
  const separator = host.node.content.size === 0 ? "" : " ";
  const insert_at = host.pos + 1 + host.node.content.size;
  dispatch(
    state.tr.insert(insert_at, state.schema.text(`${separator}^${block_id}`)),
  );
  return block_id;
}

function accepts_block_id(node: ProseNode): boolean {
  return (
    node.isTextblock &&
    node.type.name !== "heading" &&
    !node.isAtom &&
    !node.type.spec.code
  );
}

function resolve_anchor_host(doc: ProseNode, pos: number): AnchorHost | null {
  const node = doc.nodeAt(pos);
  if (!node) return null;
  if (accepts_block_id(node)) return { node, pos };
  if (node.isAtom || node.type.spec.isolating) return null;

  if (node.type.name === "list_item") {
    const first = node.firstChild;
    return first && accepts_block_id(first)
      ? { node: first, pos: pos + 1 }
      : null;
  }

  let host: AnchorHost | null = null;
  node.descendants((child, offset) => {
    if (child.type.spec.isolating) return false;
    if (!child.isTextblock) return true;
    if (accepts_block_id(child)) host = { node: child, pos: pos + 1 + offset };
    return false;
  });
  return host;
}
