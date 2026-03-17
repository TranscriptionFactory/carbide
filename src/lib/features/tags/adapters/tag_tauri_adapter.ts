import { invoke } from "@tauri-apps/api/core";
import type { TagPort } from "../ports";
import type { TagInfo } from "../types";

export class TagTauriAdapter implements TagPort {
  async list_all_tags(vaultId: string): Promise<TagInfo[]> {
    return invoke<TagInfo[]>("tags_list_all", { vaultId });
  }

  async get_notes_for_tag(vaultId: string, tag: string): Promise<string[]> {
    return invoke<string[]>("tags_get_notes_for_tag", { vaultId, tag });
  }
}
