import type { CslItem, PdfAnnotation } from "$lib/features/reference";
import type { ZoteroCollection } from "./types";

export interface ZoteroPort {
  test_connection(): Promise<boolean>;
  search_items(query: string, limit?: number): Promise<CslItem[]>;
  get_item(citekey: string): Promise<CslItem | null>;
  get_collections(): Promise<ZoteroCollection[]>;
  get_collection_items(collection_key: string): Promise<CslItem[]>;
  get_bibliography(citekeys: string[], style?: string): Promise<string>;
  get_item_annotations(citekey: string): Promise<PdfAnnotation[]>;
}
