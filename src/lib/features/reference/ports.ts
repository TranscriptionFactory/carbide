import type { ReferenceLibrary, CslItem } from "./types";

export interface ReferenceStoragePort {
  load_library(vault_id: string): Promise<ReferenceLibrary>;
  save_library(vault_id: string, library: ReferenceLibrary): Promise<void>;
  add_item(vault_id: string, item: CslItem): Promise<ReferenceLibrary>;
  remove_item(vault_id: string, citekey: string): Promise<ReferenceLibrary>;
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
  list_styles(): string[];
}

export interface DoiLookupPort {
  lookup_doi(doi: string): Promise<CslItem | null>;
}
