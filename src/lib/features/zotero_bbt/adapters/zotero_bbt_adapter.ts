import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type { ZoteroPort } from "../ports";
import type { CslItem, PdfAnnotation } from "$lib/features/reference";
import type { ZoteroCollection } from "../types";

const DEFAULT_BBT_URL = "http://localhost:23119/better-bibtex/json-rpc";

export function create_zotero_bbt_adapter(
  bbt_url: string = DEFAULT_BBT_URL,
): ZoteroPort {
  return {
    async test_connection(): Promise<boolean> {
      return tauri_invoke<boolean>("reference_bbt_test_connection", {
        bbtUrl: bbt_url,
      });
    },

    async search_items(query: string, limit?: number): Promise<CslItem[]> {
      return tauri_invoke<CslItem[]>("reference_bbt_search", {
        bbtUrl: bbt_url,
        query,
        limit: limit ?? null,
      });
    },

    async get_item(citekey: string): Promise<CslItem | null> {
      return tauri_invoke<CslItem | null>("reference_bbt_get_item", {
        bbtUrl: bbt_url,
        citekey,
      });
    },

    async get_collections(): Promise<ZoteroCollection[]> {
      return tauri_invoke<ZoteroCollection[]>("reference_bbt_collections", {
        bbtUrl: bbt_url,
      });
    },

    async get_collection_items(collection_key: string): Promise<CslItem[]> {
      return tauri_invoke<CslItem[]>("reference_bbt_collection_items", {
        bbtUrl: bbt_url,
        collectionKey: collection_key,
      });
    },

    async get_bibliography(
      citekeys: string[],
      style?: string,
    ): Promise<string> {
      return tauri_invoke<string>("reference_bbt_bibliography", {
        bbtUrl: bbt_url,
        citekeys,
        style: style ?? null,
      });
    },

    async get_item_annotations(citekey: string): Promise<PdfAnnotation[]> {
      const raw = await tauri_invoke<Record<string, unknown>[]>(
        "reference_bbt_annotations",
        { bbtUrl: bbt_url, citekey },
      );
      return raw.map((entry) => {
        const annotation: PdfAnnotation = {
          citekey,
          page: typeof entry.page === "number" ? entry.page : 0,
          text: typeof entry.text === "string" ? entry.text : "",
          type: normalize_annotation_type(entry.type),
        };
        if (typeof entry.comment === "string")
          annotation.comment = entry.comment;
        if (typeof entry.color === "string") annotation.color = entry.color;
        return annotation;
      });
    },
  };
}

function normalize_annotation_type(raw: unknown): PdfAnnotation["type"] {
  if (raw === "highlight" || raw === "note" || raw === "underline") return raw;
  return "highlight";
}
