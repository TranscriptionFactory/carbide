export type ContextBlock = {
  id: string;
  note_path: string | null;
  title: string;
  text: string;
  score: number;
  source_tag: string;
  pinned: boolean;
};

// dedup_group defaults to the source's own id, so note-level dedup is opt-in:
// sources that should compete for the same note (RAG pinned vs retrieved) must
// name a shared group. The panel deliberately repeats one note across sources.
export type ContextSource = {
  id: string;
  blocks: ContextBlock[];
  dedup_group?: string;
  max_blocks?: number;
};
