export type {
  CslItem,
  CslName,
  CslDate,
  ReferenceLibrary,
  ReferenceSource,
} from "./types";
export type {
  ReferenceStoragePort,
  CitationPort,
  DoiLookupPort,
} from "./ports";
export { ReferenceStore } from "./state/reference_store.svelte";
export { ReferenceService } from "./application/reference_service";
export { register_reference_actions } from "./application/reference_actions";
export { create_reference_tauri_adapter } from "./adapters/reference_tauri_adapter";
export { create_citationjs_adapter } from "./adapters/citationjs_adapter";
export { create_doi_tauri_adapter } from "./adapters/doi_tauri_adapter";
export {
  format_authors,
  extract_year,
  generate_citekey,
  match_query,
} from "./domain/csl_utils";
