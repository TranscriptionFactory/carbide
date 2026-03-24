import type {
  ReferenceLibrary,
  CslItem,
  ZoteroCollection,
  PdfAnnotation,
  ScanEntry,
  LinkedSourceFsEvent,
} from "./types";

export interface ReferenceStoragePort {
  load_library(vault_id: string): Promise<ReferenceLibrary>;
  save_library(vault_id: string, library: ReferenceLibrary): Promise<void>;
  add_item(vault_id: string, item: CslItem): Promise<ReferenceLibrary>;
  remove_item(vault_id: string, citekey: string): Promise<ReferenceLibrary>;
  save_annotation_note(
    vault_id: string,
    citekey: string,
    markdown: string,
  ): Promise<void>;
  read_annotation_note(
    vault_id: string,
    citekey: string,
  ): Promise<string | null>;
}

export interface CitationPort {
  parse_bibtex(bibtex: string): Promise<CslItem[]>;
  parse_ris(ris: string): Promise<CslItem[]>;
  render_citation(
    items: CslItem[],
    style: string,
    format?: "text" | "html",
  ): Promise<string>;
  render_bibliography(
    items: CslItem[],
    style: string,
    format?: "text" | "html",
  ): Promise<string>;
  format_bibtex(items: CslItem[]): Promise<string>;
  format_ris(items: CslItem[]): Promise<string>;
  list_styles(): string[];
}

export interface DoiLookupPort {
  lookup_doi(doi: string): Promise<CslItem | null>;
}

export interface ZoteroPort {
  test_connection(): Promise<boolean>;
  search_items(query: string, limit?: number): Promise<CslItem[]>;
  get_item(citekey: string): Promise<CslItem | null>;
  get_collections(): Promise<ZoteroCollection[]>;
  get_collection_items(collection_key: string): Promise<CslItem[]>;
  get_bibliography(citekeys: string[], style?: string): Promise<string>;
  get_item_annotations(citekey: string): Promise<PdfAnnotation[]>;
}

export interface LinkedSourcePort {
  scan_folder(path: string): Promise<ScanEntry[]>;
  extract_file(path: string): Promise<ScanEntry>;
  watch(path: string): Promise<void>;
  unwatch(path: string): Promise<void>;
  unwatch_all(): Promise<void>;
  subscribe_events(callback: (event: LinkedSourceFsEvent) => void): () => void;
}
