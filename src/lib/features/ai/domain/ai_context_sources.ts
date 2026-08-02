import type { ContextBlock, ContextSource } from "$lib/features/assistant";
import type {
  AiVaultContext,
  AiVaultContextNote,
} from "$lib/features/ai/domain/ai_types";
import type { ContextSourceId } from "$lib/shared/types/prompt_recipe";

export type EditorContextMaterial = {
  cursor_window?: string;
  selection?: string;
  active_document?: string;
  vault?: AiVaultContext;
};

// Vault notes keep the order their port returned — similarity rank for similar
// notes, link order for the rest — so ids encode position rather than path.
function vault_blocks(
  source_id: ContextSourceId,
  notes: AiVaultContextNote[],
): ContextBlock[] {
  return notes.map((note, rank) => ({
    id: `${source_id}:${String(rank).padStart(3, "0")}`,
    note_path: note.path,
    title: note.title,
    text: note.blurb,
    score: 0,
    source_tag: source_id,
    pinned: false,
  }));
}

// Editor fragments carry no note_path: they are slices of the note being
// edited, not vault entries, and a selection must never dedup against the
// document it was taken from.
function fragment_block(
  source_id: ContextSourceId,
  text: string,
): ContextBlock {
  return {
    id: source_id,
    note_path: null,
    title: source_id,
    text,
    score: 0,
    source_tag: source_id,
    pinned: false,
  };
}

function blocks_for(
  source_id: ContextSourceId,
  material: EditorContextMaterial,
): ContextBlock[] {
  switch (source_id) {
    case "cursor_window":
    case "selection":
    case "active_document": {
      const text = material[source_id];
      return text ? [fragment_block(source_id, text)] : [];
    }
    case "similar_notes":
      return vault_blocks(source_id, material.vault?.similar_notes ?? []);
    case "backlinks":
      return vault_blocks(source_id, material.vault?.backlinks ?? []);
    case "outlinks":
      return vault_blocks(source_id, material.vault?.outlinks ?? []);
    default:
      return [];
  }
}

export function build_editor_sources(
  declared: ContextSourceId[],
  material: EditorContextMaterial,
): ContextSource[] {
  return declared.map((source_id) => ({
    id: source_id,
    blocks: blocks_for(source_id, material),
  }));
}
