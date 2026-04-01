import type {
  ReferenceLibrary,
  CslItem,
  PdfAnnotation,
  ScanEntry,
  LinkedSourceMeta,
  LinkedNoteInfo,
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

export interface ReferenceSearchExtension {
  id: string;
  label: string;
  test_connection(): Promise<boolean>;
  search(query: string, limit?: number): Promise<CslItem[]>;
  get_item(citekey: string): Promise<CslItem | null>;
  get_annotations?(citekey: string): Promise<PdfAnnotation[]>;
}

export interface LinkedSourcePort {
  scan_folder(path: string): Promise<ScanEntry[]>;
  extract_file(path: string): Promise<ScanEntry>;
  list_files(
    path: string,
  ): Promise<{ file_path: string; modified_at: number }[]>;
  index_content(
    vault_id: string,
    source_id: string,
    source_name: string,
    entry: ScanEntry,
    linked_meta: LinkedSourceMeta,
  ): Promise<void>;
  remove_content(
    vault_id: string,
    source_name: string,
    file_path: string,
  ): Promise<void>;
  clear_source(vault_id: string, source_name: string): Promise<void>;

  query_linked_notes(
    vault_id: string,
    source_name: string,
  ): Promise<LinkedNoteInfo[]>;
  count_linked_notes(vault_id: string, source_name: string): Promise<number>;
  find_by_citekey(
    vault_id: string,
    citekey: string,
  ): Promise<LinkedNoteInfo | null>;
  search_linked_notes(
    vault_id: string,
    query: string,
    limit?: number,
  ): Promise<LinkedNoteInfo[]>;
  update_linked_metadata(
    vault_id: string,
    source_name: string,
    external_file_path: string,
    linked_meta: LinkedSourceMeta,
  ): Promise<boolean>;
}
