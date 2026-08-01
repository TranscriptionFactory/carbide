export {
  type DocumentFileType,
  detect_file_type,
} from "$lib/features/document/domain/document_types";
export { is_editable_type } from "$lib/features/document/types/document";
export {
  DocumentStore,
  type DocumentContentState,
  type DocumentViewerState,
} from "$lib/features/document/state/document_store.svelte";
export {
  type DocumentPort,
  type NoteExportFormat,
  type NoteExportPort,
  type TrustedHtmlPort,
  type ReadingPositionPort,
  type TrustLevel,
  type TrustScope,
  type TrustEntry,
} from "$lib/features/document/ports";
export { create_document_tauri_adapter } from "$lib/features/document/adapters/document_tauri_adapter";
export { create_note_export_tauri_adapter } from "$lib/features/document/adapters/note_export_tauri_adapter";
export { create_trusted_html_tauri_adapter } from "$lib/features/document/adapters/trusted_html_tauri_adapter";
export { create_reading_position_tauri_adapter } from "$lib/features/document/adapters/reading_position_tauri_adapter";
export {
  slugify_for_filename,
  build_clipboard_provenance,
  type ArtifactProvenance,
} from "$lib/features/document/domain/html_artifact_paste";
export {
  render_note_to_html,
  render_note_body_html,
  note_export_styles,
  type ImageResolver,
  type ImageSourceKind,
} from "$lib/features/document/domain/note_html";
export {
  create_epub_image_collector,
  type NoteAssetPathResolver,
} from "$lib/features/document/domain/note_epub";
export { resolve_note_asset_path } from "$lib/features/document/domain/note_export_assets";
export {
  DocumentService,
  type DocumentAiContext,
} from "$lib/features/document/application/document_service";
export { register_document_actions } from "$lib/features/document/application/document_actions";
export { default as DocumentViewer } from "$lib/features/document/ui/document_viewer.svelte";
