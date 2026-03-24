import type { DoiLookupPort } from "../ports";
import type { CslItem } from "../types";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";

export function create_doi_tauri_adapter(): DoiLookupPort {
  return {
    async lookup_doi(doi: string): Promise<CslItem | null> {
      return tauri_invoke<CslItem | null>("reference_doi_lookup", { doi });
    },
  };
}
