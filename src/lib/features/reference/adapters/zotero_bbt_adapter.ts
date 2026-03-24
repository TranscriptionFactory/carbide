import { invoke } from "@tauri-apps/api/core";
import type { ZoteroPort } from "../ports";
import type { CslItem, ZoteroCollection } from "../types";

const DEFAULT_BBT_URL = "http://localhost:23119/better-bibtex/json-rpc";

export function create_zotero_bbt_adapter(
  bbt_url: string = DEFAULT_BBT_URL,
): ZoteroPort {
  return {
    async test_connection(): Promise<boolean> {
      return invoke<boolean>("reference_bbt_test_connection", {
        bbtUrl: bbt_url,
      });
    },

    async search_items(query: string, limit?: number): Promise<CslItem[]> {
      return invoke<CslItem[]>("reference_bbt_search", {
        bbtUrl: bbt_url,
        query,
        limit: limit ?? null,
      });
    },

    async get_item(citekey: string): Promise<CslItem | null> {
      return invoke<CslItem | null>("reference_bbt_get_item", {
        bbtUrl: bbt_url,
        citekey,
      });
    },

    async get_collections(): Promise<ZoteroCollection[]> {
      return invoke<ZoteroCollection[]>("reference_bbt_collections", {
        bbtUrl: bbt_url,
      });
    },

    async get_collection_items(collection_key: string): Promise<CslItem[]> {
      return invoke<CslItem[]>("reference_bbt_collection_items", {
        bbtUrl: bbt_url,
        collectionKey: collection_key,
      });
    },

    async get_bibliography(
      citekeys: string[],
      style?: string,
    ): Promise<string> {
      return invoke<string>("reference_bbt_bibliography", {
        bbtUrl: bbt_url,
        citekeys,
        style: style ?? null,
      });
    },
  };
}
