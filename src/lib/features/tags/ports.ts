import type { TagInfo } from "./types";

export interface TagPort {
  list_all_tags(vault_id: string): Promise<TagInfo[]>;
  get_notes_for_tag(vault_id: string, tag: string): Promise<string[]>;
  get_notes_for_tag_prefix(vault_id: string, tag: string): Promise<string[]>;
}

export type TagMatchScore = {
  tag: string;
  /** Score in [0, 1]; higher = better match. */
  score: number;
  kind: "prefix" | "fuzzy";
};
