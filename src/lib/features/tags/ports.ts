import type { TagInfo } from "./types";

export interface TagPort {
  list_all_tags(vault_id: string): Promise<TagInfo[]>;
  get_notes_for_tag(vault_id: string, tag: string): Promise<string[]>;
}
