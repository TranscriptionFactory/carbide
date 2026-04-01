export type {
  CslItem,
  CslName,
  CslDate,
  ReferenceLibrary,
  ReferenceSource,
  LinkedSource,
  ScanEntry,
  PdfAnnotation,
} from "./types";
export type {
  ReferenceStoragePort,
  CitationPort,
  DoiLookupPort,
  ReferenceSearchExtension,
  LinkedSourcePort,
} from "./ports";
export { ReferenceStore } from "./state/reference_store.svelte";
export { ReferenceService } from "./application/reference_service";
export { register_reference_actions } from "./application/reference_actions";
export { create_reference_tauri_adapter } from "./adapters/reference_tauri_adapter";
export { create_citationjs_adapter } from "./adapters/citationjs_adapter";
export { create_doi_tauri_adapter } from "./adapters/doi_tauri_adapter";
export { create_linked_source_tauri_adapter } from "./adapters/linked_source_tauri_adapter";
export {
  format_authors,
  extract_year,
  generate_citekey,
  match_query,
} from "./domain/csl_utils";
export {
  scan_entry_to_csl_item,
  derive_title_from_filename,
  parse_author_string,
  generate_linked_source_id,
} from "./domain/linked_source_utils";
export { default as CitationPicker } from "./ui/citation_picker.svelte";
export { default as MissingLinkedSourceDialog } from "./ui/missing_linked_source_dialog.svelte";
export type { FrontmatterReference } from "./domain/frontmatter_sync";
export {
  sync_reference_to_frontmatter,
  remove_reference_from_frontmatter,
  sync_reference_to_markdown,
  extract_frontmatter,
} from "./domain/frontmatter_sync";
export {
  annotations_to_markdown,
  merge_annotations,
} from "./domain/annotation_to_markdown";
